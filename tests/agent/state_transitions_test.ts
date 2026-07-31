import { assert, assertEquals } from '@std/assert';
import type { AgentConfig, ToolCall } from '../../src/core/types.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';
import { createInitialState, applyToolResults, applyAssistantFinal, redactArgsSummary, isFailureObservation, summarizeObservation, markPlan } from '../../src/agent/state-transitions.ts';
import type { ToolExecResult } from '../../src/agent/state-transitions.ts';

const config: AgentConfig = {
  maxIterations: 15,
  model: 'test-model',
  workingDir: '/test',
  permissions: 'default',
  concurrency: 4,
  contextTokenLimit: 128_000,
  sterileLoopThreshold: 3,
  summaryTokenThreshold: 2_000,
  maxOutputChars: 100_000,
  numCtx: null,
  outputReserveTokens: 512,
  toolProtocolMode: 'hybrid',
  hybridNativeToolsMinCtx: 16384,
  compactCatalogMaxTokens: 600,
  maxRecentActions: 3,
  maxOpenErrors: 5,
  maxPlanSteps: 12,
  maxArtifactsInPrompt: 30,
  useExecutionState: true,
};

function call(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { id, name, args };
}

function result(callId: string, output: string, toolName: string): ToolExecResult {
  return { callId, output, toolName };
}

Deno.test('applyToolResults registra action, lastAction e artifact no WriteFile sucesso', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('h.js', 'console.log(1)');
  const state = createInitialState('Write a helloworld.js file using WriteFile', config, []);
  state.iteration = 1;

  const next = await applyToolResults(
    state,
    [call('c1', 'WriteFile', { path: 'h.js', content: 'console.log(1)' })],
    [result('c1', 'Arquivo escrito: h.js', 'WriteFile')],
    ws,
    config,
  );

  assert(next.lastAction !== null);
  assertEquals(next.lastAction.tool, 'WriteFile');
  assertEquals(next.lastAction.ok, true);
  assertEquals(next.recentActions.length, 1);
  assertEquals(next.flags.lastWriteGateFailed, false);
  assertEquals(next.artifacts.length, 1);
  assertEquals(next.artifacts[0].path, 'h.js');
  assert(next.artifacts[0].size > 0);
  assertEquals(next.artifacts[0].source, 'write');
  const writeStep = next.plan.find((p) => p.id === 'write');
  assertEquals(writeStep?.status, 'done');
});

Deno.test('applyToolResults gate fail marca lastWriteGateFailed e openErrors', async () => {
  const ws = new MemoryWorkspace();
  const state = createInitialState('Write a helloworld.js file', config, []);
  state.iteration = 2;

  const next = await applyToolResults(
    state,
    [call('c1', 'WriteFile', { path: 'h.js', content: 'x' })],
    [result('c1', 'Validação pós-escrita falhou — alteração revertida.\nh.js\nLint: erro', 'WriteFile')],
    ws,
    config,
  );

  assertEquals(next.flags.lastWriteGateFailed, true);
  assert(next.openErrors.length >= 1);
  assert(next.openErrors[0].startsWith('Validação pós-escrita falhou'));
  assertEquals(next.plan.find((p) => p.id === 'write')?.status, 'failed');
});

Deno.test('applyToolResults WriteFile sucesso limpa openErrors de gate', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('h.js', 'x');
  let state = createInitialState('Write a helloworld.js file', config, []);
  state.iteration = 2;

  state = await applyToolResults(
    state,
    [call('c1', 'WriteFile', { path: 'h.js', content: 'x' })],
    [result('c1', 'Validação pós-escrita falhou — alteração revertida.\nh.js\nLint', 'WriteFile')],
    ws,
    config,
  );
  assert(state.openErrors.length >= 1);

  const next = await applyToolResults(
    state,
    [call('c2', 'WriteFile', { path: 'h.js', content: 'ok' })],
    [result('c2', 'Arquivo escrito: h.js', 'WriteFile')],
    ws,
    config,
  );
  assertEquals(next.openErrors.length, 0);
});

Deno.test('applyToolResults HITL reject registra ok=false e openError', async () => {
  const ws = new MemoryWorkspace();
  const state = createInitialState('Write a helloworld.js file', config, []);
  state.iteration = 1;

  const next = await applyToolResults(
    state,
    [call('c1', 'WriteFile', { path: 'h.js', content: 'x' })],
    [result('c1', 'Ação rejeitada pelo usuário: sem motivo', 'WriteFile')],
    ws,
    config,
  );

  assert(next.lastAction !== null);
  assertEquals(next.lastAction.ok, false);
  assert(next.openErrors.length >= 1);
});

Deno.test('applyToolResults WebSearch marca step search', async () => {
  const ws = new MemoryWorkspace();
  const state = createInitialState('Search with websearch about gohorse', config, []);
  state.iteration = 1;

  const okState = await applyToolResults(
    state,
    [call('c1', 'WebSearch', { query: 'gohorse' })],
    [result('c1', 'Resultados: ...', 'WebSearch')],
    ws,
    config,
  );
  assertEquals(okState.plan.find((p) => p.id === 'search')?.status, 'done');

  const failState = await applyToolResults(
    state,
    [call('c1', 'WebSearch', { query: 'gohorse' })],
    [result('c1', 'Erro: timeout', 'WebSearch')],
    ws,
    config,
  );
  assertEquals(failState.plan.find((p) => p.id === 'search')?.status, 'failed');
});

Deno.test('recentActions respeita maxRecentActions (ring)', async () => {
  const ws = new MemoryWorkspace();
  let state = createInitialState('Write a helloworld.js file', config, []);

  for (let i = 1; i <= 10; i++) {
    state.iteration = i;
    state = await applyToolResults(
      state,
      [call(`c${i}`, 'ReadFile', { paths: ['a.js'] })],
      [result(`c${i}`, 'conteúdo', 'ReadFile')],
      ws,
      config,
    );
  }

  assertEquals(state.recentActions.length, config.maxRecentActions);
  assertEquals(state.lastAction?.iteration, 10);
});

Deno.test('openErrors respeita maxOpenErrors (ring)', async () => {
  const ws = new MemoryWorkspace();
  let state = createInitialState('Write a helloworld.js file', config, []);

  for (let i = 1; i <= 10; i++) {
    state.iteration = i;
    state = await applyToolResults(
      state,
      [call(`c${i}`, 'WriteFile', { path: 'x.js', content: 'x' })],
      [result(`c${i}`, `Validação pós-escrita falhou — lint ${i}`, 'WriteFile')],
      ws,
      config,
    );
  }

  assert(state.openErrors.length <= config.maxOpenErrors);
  assertEquals(state.openErrors.length, config.maxOpenErrors);
});

Deno.test('applyAssistantFinal marca verify done quando conteúdo e artifact ok', () => {
  const state = createInitialState('Write a helloworld.js file', config, []);
  const withWrite = { ...state, iteration: 1 };
  const afterWrite = applyAssistantFinal(
    { ...withWrite, artifacts: [{ path: 'helloworld.js', size: 5, source: 'write', updatedAtIteration: 1 }] },
    'pronto, arquivo criado',
    config,
  );
  assertEquals(afterWrite.plan.find((p) => p.id === 'verify')?.status, 'done');
});

Deno.test('applyAssistantFinal NÃO marca verify done com gate falho', () => {
  const state = createInitialState('Write a helloworld.js file', config, []);
  const next = applyAssistantFinal(
    { ...state, flags: { ...state.flags, lastWriteGateFailed: true } },
    'pronto',
    config,
  );
  assertEquals(next.plan.find((p) => p.id === 'verify')?.status, 'pending');
});

Deno.test('applyAssistantFinal não altera objective', () => {
  const state = createInitialState('Write a helloworld.js file', config, []);
  const next = applyAssistantFinal(state, 'pronto', config);
  assertEquals(next.objective, state.objective);
});

Deno.test('redactArgsSummary trunca content > 80 e total > 500', () => {
  const longContent = 'a'.repeat(100);
  const summary = redactArgsSummary({ path: 'x.js', content: longContent });
  assert(summary.length <= 500);
  assert(summary.includes('len=100'));
  assert(summary.includes('…'));

  const huge = redactArgsSummary({ foo: 'x'.repeat(700) });
  assertEquals(huge.length, 501);
  assert(huge.endsWith('…'));
});

Deno.test('isFailureObservation reconhece prefixos', () => {
  assert(isFailureObservation('Erro: algo deu errado'));
  assert(isFailureObservation('Erro na execução: crash'));
  assert(isFailureObservation('Validação pós-escrita falhou — revertida'));
  assert(isFailureObservation('Ação rejeitada pelo usuário: não'));
  assert(isFailureObservation('Path fora do workspace: /etc'));
  assert(!isFailureObservation('[DRY-RUN] Simulado: WriteFile({...})'));
  assert(!isFailureObservation('Arquivo escrito: h.js'));
});

Deno.test('summarizeObservation trunca > 800', () => {
  const short = summarizeObservation('ok');
  assertEquals(short, 'ok');
  const long = summarizeObservation('x'.repeat(900));
  assertEquals(long.length, 801);
});

Deno.test('markPlan atualiza status de step', () => {
  const state = createInitialState('Write a helloworld.js file', config, []);
  const next = markPlan(state, config, 'inspect', 'done', 'verificado');
  assertEquals(next.plan.find((p) => p.id === 'inspect')?.status, 'done');
  assertEquals(next.plan.find((p) => p.id === 'inspect')?.note, 'verificado');
});
