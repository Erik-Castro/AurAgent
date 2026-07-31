import type { AgentContext } from './agent-context.ts';
import type { WorkingMemory } from './memory.ts';
import type { AgentResult } from './agent.ts';
import { SterileLoopDetector } from './sterile-detector.ts';
import { Explainer } from './explainer.ts';
import { normalizeModelResponse } from './normalize-response.ts';
import {
  maxTokensOut,
  resolveToolProtocolMode,
  shouldSendNativeTools,
  trimMessagesToBudget,
} from './token-budget.ts';
import { DEFAULT_FALLBACK_NUM_CTX } from '../core/constants.ts';
import type {
  GenerateResponse,
  StreamDisplay,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from '../core/types.ts';

export async function runReActLoop(
  task: string,
  ctx: AgentContext,
  memory: WorkingMemory,
  display?: StreamDisplay,
): Promise<AgentResult> {
  const startTime = Date.now();
  let iterations = 0;
  const sterileDetector = new SterileLoopDetector(
    ctx.config.sterileLoopThreshold,
  );
  let lastOutput = '';
  let explainer: Explainer | undefined;
  let lastWriteGateFailed = false;
  let anyToolExecuted = false;

  const knownToolNames = new Set(ctx.toolHandlers.keys());
  const mode = resolveToolProtocolMode(ctx.config.toolProtocolMode, Deno.env.toObject());
  const numCtx = ctx.config.numCtx ?? DEFAULT_FALLBACK_NUM_CTX;
  const promptBudget = numCtx - ctx.config.outputReserveTokens;
  const sendNativeTools = shouldSendNativeTools(
    mode,
    numCtx,
    ctx.config.hybridNativeToolsMinCtx,
  );
  const maxTokens = maxTokensOut(ctx.config.outputReserveTokens);
  const requestNumCtx = numCtx;

  while (iterations < ctx.config.maxIterations) {
    ctx.eventBus.emit('iteration:started', { iteration: iterations });
    iterations++;

    const tools: ToolDefinition[] = [];
    for (const handler of ctx.toolHandlers.values()) {
      tools.push(handler.definition);
    }

    const trimmed = trimMessagesToBudget(
      memory.getMessages(),
      promptBudget,
      task,
      ctx.config.summaryTokenThreshold,
    );

    if (trimmed.exceeded) {
      const msg = `Erro: prompt excede orçamento de contexto (num_ctx=${numCtx}).`;
      ctx.eventBus.emit('task:completed', { status: 'error', iterations });
      return {
        status: 'error',
        output: msg,
        iterations,
        durationMs: Date.now() - startTime,
      };
    }

    ctx.eventBus.emit('model:request_started', { iteration: iterations });

    const response = await streamResponse(
      ctx,
      trimmed.messages,
      sendNativeTools ? tools : [],
      iterations,
      display,
      (e) => {
        explainer = e;
      },
      { maxTokens, numCtx: requestNumCtx },
    );

    ctx.eventBus.emit('model:request_finished', {
      iteration: iterations,
      finishReason: response.finishReason,
    });

    const normalized = normalizeModelResponse(response, knownToolNames);

    if (normalized.finishReason === 'error') {
      return {
        status: 'error',
        output: normalized.content || 'LLM retornou um erro',
        iterations,
        durationMs: Date.now() - startTime,
      };
    }

    const pseudoUsed = (response.toolCalls?.length ?? 0) === 0 &&
      (normalized.toolCalls?.length ?? 0) > 0;

    memory.addAssistant(normalized.content, normalized.toolCalls);
    if (normalized.content) lastOutput = normalized.content;

    if (normalized.toolCalls && normalized.toolCalls.length > 0) {
      if (pseudoUsed && explainer) {
        for (const call of normalized.toolCalls) {
          explainer.onPseudoToolCall(call);
        }
      }
      anyToolExecuted = true;
      const results = await executeToolCalls(
        normalized.toolCalls,
        iterations,
        ctx,
        sterileDetector,
      );
      for (const callResult of results) {
        memory.addToolResult(
          callResult.callId,
          callResult.output,
          callResult.toolName,
        );
        if (explainer) {
          explainer.onToolResult(callResult.toolName, callResult.output);
        }
        if (callResult.output.startsWith('Validação pós-escrita falhou')) {
          lastWriteGateFailed = true;
        } else if (
          callResult.toolName === 'WriteFile' &&
          callResult.output.startsWith('Arquivo escrito:')
        ) {
          lastWriteGateFailed = false;
        }
      }
    }

    if (normalized.finishReason === 'stop' && !normalized.toolCalls?.length) {
      if (isStrictEmptyFinal(task, normalized, anyToolExecuted)) {
        return {
          status: 'error',
          output: 'Erro: modelo encerrou sem resposta e sem tool calls',
          iterations,
          durationMs: Date.now() - startTime,
        };
      }
      const status = lastWriteGateFailed ? 'failed_validation' : 'success';
      ctx.eventBus.emit('task:completed', {
        status,
        iterations,
        duration: Date.now() - startTime,
      });
      return {
        status,
        output: normalized.content,
        iterations,
        durationMs: Date.now() - startTime,
      };
    }

    if (normalized.finishReason === 'length') {
      ctx.eventBus.emit('task:completed', {
        status: 'truncated',
        iterations,
      });
      return {
        status: 'truncated',
        output: normalized.content,
        iterations,
        durationMs: Date.now() - startTime,
      };
    }

    memory.summarizeByAge();
    ctx.eventBus.emit('context:summarized', {
      iteration: iterations,
      messageCount: memory.getMessageCount(),
    });

    ctx.eventBus.emit('iteration:finished', { iteration: iterations });
  }

  return {
    status: 'max_iterations',
    output: lastOutput,
    iterations,
    durationMs: Date.now() - startTime,
  };
}

function isStrictEmptyFinal(
  task: string,
  response: GenerateResponse,
  anyToolExecuted: boolean,
): boolean {
  if (Deno.env.get('AUR_STRICT_EMPTY_FINAL') !== '1') return false;
  if (task.length === 0) return false;
  if (anyToolExecuted) return false;
  return (response.content ?? '').trim() === '';
}

async function streamResponse(
  ctx: AgentContext,
  messages: import('../core/types.ts').Message[],
  tools: ToolDefinition[],
  iteration: number,
  display?: StreamDisplay,
  onExplainer?: (e: Explainer) => void,
  budget?: { maxTokens: number; numCtx: number },
): Promise<GenerateResponse> {
  const useDisplay = !!display;
  const useExplainer = !display && ctx.config.explain;
  const request = { messages, tools, ...budget };

  if (!useDisplay && !useExplainer) {
    return await ctx.modelProvider.generate(request);
  }

  const sink = display ?? new Explainer(true);
  if (sink instanceof Explainer) onExplainer?.(sink);
  sink.startIteration(iteration);

  const stream = ctx.modelProvider.stream(request);
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    switch (value.type) {
      case 'token':
        sink.onToken(value.text);
        break;
      case 'tool_call':
        sink.onToolCall(value.call);
        break;
      case 'done':
        sink.onDone(value.finishReason);
        break;
      case 'error':
        sink.onError(value.message);
        break;
    }
  }

  if (useDisplay) (sink as StreamDisplay).flush();

  if (sink instanceof Explainer) return sink.getResult();

  return {
    content: '',
    toolCalls: undefined,
    finishReason: 'stop',
  };
}

interface ToolExecResult {
  callId: string;
  output: string;
  toolName: string;
}

async function executeToolCalls(
  toolCalls: ToolCall[],
  iteration: number,
  ctx: AgentContext,
  sterileDetector: SterileLoopDetector,
): Promise<ToolExecResult[]> {
  const results: ToolExecResult[] = [];

  const safe: ToolCall[] = [];
  const sequential: ToolCall[] = [];

  for (const call of toolCalls) {
    const handler = ctx.toolHandlers.get(call.name);
    if (handler?.parallelSafe) {
      safe.push(call);
    } else {
      sequential.push(call);
    }
  }

  for (let i = 0; i < safe.length; i += ctx.config.concurrency) {
    const batch = safe.slice(i, i + ctx.config.concurrency);
    const batchResults = await Promise.all(
      batch.map((call) => executeOneToolCall(call, iteration, ctx, sterileDetector)),
    );
    results.push(...batchResults);
  }

  for (const call of sequential) {
    const r = await executeOneToolCall(call, iteration, ctx, sterileDetector);
    results.push(r);
  }

  return results;
}

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const GATE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

function isTypeScriptFile(path: string): boolean {
  return TS_EXTENSIONS.has(path.slice(path.lastIndexOf('.')));
}

function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot).toLowerCase();
}

async function runPreCommitGate(
  path: string,
  ctx: AgentContext,
): Promise<{ passed: boolean; output: string }> {
  const errors: string[] = [];
  const escapedPath = path.replace(/'/g, "'\\''");

  const lintResult = await ctx.processRunner.run({
    command: `deno lint '${escapedPath}'`,
    cwd: ctx.config.workingDir,
  });
  if (lintResult.code !== 0) {
    errors.push(`Lint:\n${lintResult.stderr || lintResult.stdout}`);
  }

  if (isTypeScriptFile(path)) {
    const checkResult = await ctx.processRunner.run({
      command: `deno check '${escapedPath}'`,
      cwd: ctx.config.workingDir,
    });
    if (checkResult.code !== 0) {
      errors.push(`Type check:\n${checkResult.stderr || checkResult.stdout}`);
    }
  }

  if (errors.length > 0) {
    return { passed: false, output: errors.join('\n') };
  }
  return { passed: true, output: '' };
}

async function executeOneToolCall(
  call: ToolCall,
  iteration: number,
  ctx: AgentContext,
  sterileDetector: SterileLoopDetector,
): Promise<ToolExecResult> {
  const handler = ctx.toolHandlers.get(call.name);
  if (!handler) {
    return {
      callId: call.id,
      output: `Erro: Ferramenta "${call.name}" não encontrada.`,
      toolName: call.name,
    };
  }

  sterileDetector.check(call.name, call.args);

  ctx.eventBus.emit('tool:started', {
    tool: call.name,
    args: call.args,
    riskLevel: handler.riskLevel,
  });

  if (call.name === 'WriteFile' && call.args.path) {
    const wfPath = call.args.path as string;
    if (typeof wfPath !== 'string' || wfPath.trim() === '') {
      return {
        callId: call.id,
        output: 'Erro: path inválido ou fora do workspace: path vazio',
        toolName: call.name,
      };
    }
    try {
      await ctx.workspace.exists(wfPath);
    } catch {
      return {
        callId: call.id,
        output: `Erro: path inválido ou fora do workspace: ${wfPath}`,
        toolName: call.name,
      };
    }
  }

  if (call.name === 'WriteFile' && ctx.checkpointManager && call.args.path) {
    await ctx.checkpointManager.saveBeforeWrite(
      call.args.path as string,
      iteration,
      ctx.workspace,
    );
  }

  const needsApproval = (handler.riskLevel === 'medium' || handler.riskLevel === 'high') &&
    ctx.config.permissions === 'default';

  if (needsApproval) {
    ctx.eventBus.emit('tool:hitl_required', {
      tool: call.name,
      args: call.args,
      riskLevel: handler.riskLevel,
    });

    if (ctx.hitlManager) {
      const decision = await ctx.hitlManager.requestApproval(
        call.name,
        call.args,
        handler.riskLevel,
      );

      if (!decision.approved) {
        return {
          callId: call.id,
          output: `Ação rejeitada pelo usuário: ${decision.reason ?? 'sem motivo'}`,
          toolName: call.name,
        };
      }

      if (decision.editedArgs) {
        call.args = decision.editedArgs;
      }
    }
  }

  if (ctx.config.dryRun && handler.riskLevel !== 'low') {
    return {
      callId: call.id,
      output: `[DRY-RUN] Simulado: ${call.name}(${JSON.stringify(call.args)})`,
      toolName: call.name,
    };
  }

  try {
    const result: ToolResult = await handler.execute(call, {
      workspace: ctx.workspace,
      processRunner: ctx.processRunner,
      eventBus: ctx.eventBus,
      memoryStore: ctx.memoryStore,
      config: ctx.config,
      readInput: ctx.readInput,
    });

    if (
      call.name === 'WriteFile' &&
      ctx.config.preCommitGate &&
      result.output.startsWith('Arquivo escrito') &&
      GATE_EXTENSIONS.has(getExtension(call.args.path as string))
    ) {
      const gateResult = await runPreCommitGate(
        call.args.path as string,
        ctx,
      );
      if (!gateResult.passed) {
        await ctx.checkpointManager?.restoreLast(ctx.workspace);
        ctx.eventBus.emit('tool:gate_failed', {
          path: call.args.path as string,
          output: gateResult.output,
        });
        return {
          callId: call.id,
          output:
            `Validação pós-escrita falhou — alteração revertida.\n${call.args.path}\n${gateResult.output}`,
          toolName: call.name,
        };
      }
    }

    ctx.eventBus.emit('tool:finished', {
      tool: call.name,
      callId: call.id,
    });

    return {
      callId: call.id,
      output: result.output,
      toolName: call.name,
    };
  } catch (err) {
    const msg = (err as Error).message;
    ctx.eventBus.emit('tool:failed', {
      tool: call.name,
      callId: call.id,
      error: msg,
    });
    return {
      callId: call.id,
      output: `Erro na execução: ${msg}`,
      toolName: call.name,
    };
  }
}
