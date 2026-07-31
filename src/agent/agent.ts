import type { AgentContext } from './agent-context.ts';
import { ReadOnlyGuard } from './read-only-guard.ts';
import { HITLManager } from './hitl-manager.ts';
import { CheckpointManager } from './checkpoint.ts';
import { buildSessionSummary } from './summarizer.ts';
import { WorkingMemory } from './memory.ts';
import { runReActLoop } from './loop.ts';
import { resolveNumCtx } from './token-budget.ts';
import type { ToolDefinition } from '../core/types.ts';

export interface AgentResult {
  status: 'success' | 'error' | 'max_iterations' | 'truncated' | 'failed_validation';
  output: string;
  iterations: number;
  durationMs: number;
}

export class Agent {
  constructor(private ctx: AgentContext) {
    this.applySecurity();
  }

  async run(task: string): Promise<AgentResult> {
    this.ctx.eventBus.emit('task:started', { task });

    await this.resolveNumCtx();

    const memory = new WorkingMemory(this.ctx.config);
    const definitions: ToolDefinition[] = [...this.ctx.toolHandlers.values()].map(
      (h) => h.definition,
    );
    await memory.loadInstructionFiles(this.ctx.workspace, definitions);
    this.ctx.eventBus.emit('memory:loaded', { messageCount: memory.getMessageCount() });
    memory.addUser(task);

    try {
      const result = await runReActLoop(task, this.ctx, memory, this.ctx.config.display);

      await this.ctx.checkpointManager?.cleanup();
      await this.persistSessionSummary(task, result, memory);

      return result;
    } catch (err) {
      await this.ctx.checkpointManager?.cleanup();

      const msg = (err as Error).message;
      this.ctx.eventBus.emit('task:cancelled', { error: msg });
      return {
        status: 'error',
        output: msg,
        iterations: 0,
        durationMs: 0,
      };
    } finally {
      // Close the KV store to prevent resource leaks
      const maybeClosable = this.ctx.memoryStore as unknown as { close?: () => void };
      if (typeof maybeClosable.close === 'function') {
        try {
          maybeClosable.close();
        } catch {
          // non-critical cleanup
        }
      }
    }
  }

  private async resolveNumCtx(): Promise<void> {
    let ollamaShowCtx: number | null = null;
    if (this.ctx.modelProvider.getContextWindow) {
      try {
        ollamaShowCtx = await this.ctx.modelProvider.getContextWindow();
      } catch {
        ollamaShowCtx = null;
      }
    }
    const budget = resolveNumCtx(
      this.ctx.config,
      Deno.env.toObject(),
      ollamaShowCtx,
    );
    this.ctx.config = {
      ...this.ctx.config,
      numCtx: budget.numCtx,
      outputReserveTokens: budget.outputReserveTokens,
    };
  }

  private applySecurity(): void {
    const patches: Partial<AgentContext> = {};

    if (this.ctx.config.permissions === 'readonly') {
      patches.workspace = new ReadOnlyGuard(this.ctx.workspace);
    }

    if (
      !this.ctx.hitlManager &&
      this.ctx.config.permissions !== 'approve-all'
    ) {
      patches.hitlManager = new HITLManager();
    }

    if (!this.ctx.checkpointManager) {
      patches.checkpointManager = new CheckpointManager(
        this.ctx.config.workingDir,
        this.ctx.eventBus,
      );
    }

    this.ctx = { ...this.ctx, ...patches };
  }

  private async persistSessionSummary(
    task: string,
    result: AgentResult,
    memory: WorkingMemory,
  ): Promise<void> {
    try {
      const summary = buildSessionSummary(
        task,
        result,
        memory.getMessageCount(),
      );
      const projectKey = this.ctx.config.workingDir.replace(/[\/\\]/g, '_');
      const key = `session:${projectKey}:${Date.now()}`;
      await this.ctx.memoryStore.set(key, summary);
      this.ctx.eventBus.emit('memory:persisted', { key, task, status: result.status });
    } catch {
      // non-critical, ignore
    }
  }
}
