import { assert, assertEquals, assertThrows } from '@std/assert';
import type { AgentConfig } from '../../src/core/types.ts';
import { StateInvariantError } from '../../src/core/errors.ts';
import {
  assertValidState,
  type AgentState,
  type ArtifactRecord,
} from '../../src/agent/state.ts';
import {
  buildConstraints,
  createInitialState,
  deriveAcceptance,
  deriveInitialPlan,
} from '../../src/agent/state-transitions.ts';

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

Deno.test('deriveAcceptance aplica regras A1-A5', () => {
  const items = deriveAcceptance('Write a helloworld.js file using WriteFile');
  assert(items.some((a) => a.includes('hello world behavior')));
  assert(items.some((a) => a.includes('JavaScript file')));
  assert(items.some((a) => a.includes('write tool must be used')));
  assert(items.some((a) => a.includes('Do not use paths outside')));
  assertEquals(items.length, 4);
});

Deno.test('deriveAcceptance inclui WebSearch para task de busca', () => {
  const items = deriveAcceptance('Use websearch to search gohorse pattern');
  assert(items.some((a) => a.includes('WebSearch must be invoked')));
  assert(items.some((a) => a.includes('Do not use paths outside')));
});

Deno.test('deriveAcceptance sempre inclui A5', () => {
  const items = deriveAcceptance('qualquer coisa');
  assert(items.some((a) => a.includes('Do not use paths outside')));
  assertEquals(items.length, 1);
});

Deno.test('deriveInitialPlan usa P1 para js', () => {
  const plan = deriveInitialPlan('Write a helloworld.js file');
  assertEquals(plan.map((p) => p.id), ['inspect', 'write', 'verify']);
});

Deno.test('deriveInitialPlan usa P2 para busca sem P1', () => {
  const plan = deriveInitialPlan('Search with websearch about gohorse');
  assertEquals(plan.map((p) => p.id), ['search', 'answer']);
});

Deno.test('deriveInitialPlan usa P3 para tasks genéricas', () => {
  const plan = deriveInitialPlan('explique o conceito de monad');
  assertEquals(plan.map((p) => p.id), ['act', 'verify']);
});

Deno.test('createInitialState monta estado válido', () => {
  const state = createInitialState(
    'Write a helloworld.js file using WriteFile',
    config,
    [],
  );
  assertEquals(state.objective, 'Write a helloworld.js file using WriteFile');
  assertEquals(state.iteration, 0);
  assertEquals(state.recentActions.length, 0);
  assertEquals(state.lastAction, null);
  assertEquals(state.openErrors.length, 0);
  assertEquals(state.plan.length, 3);
  assertEquals(state.flags.readonly, false);
  assertEquals(state.flags.lastWriteGateFailed, false);
  assertEquals(state.flags.sterileStop, false);
});

Deno.test('createInitialState lança para task vazia', () => {
  assertThrows(() => createInitialState('   ', config, []));
});

Deno.test('createInitialState filtra artifact inválido e preserva mencionados na task', () => {
  const index: ArtifactRecord[] = [
    { path: 'a.js', size: 10, source: 'preexisting', updatedAtIteration: 0 },
    { path: '../escape.js', size: 5, source: 'preexisting', updatedAtIteration: 0 },
    { path: 'b.js', size: 20, source: 'preexisting', updatedAtIteration: 0 },
    { path: 'helloworld.js', size: 30, source: 'preexisting', updatedAtIteration: 0 },
  ];
  const state = createInitialState('fix helloworld.js', config, index);
  const paths = state.artifacts.map((a) => a.path);
  assert(paths.includes('helloworld.js'));
  assert(!paths.includes('../escape.js'));
});

Deno.test('buildConstraints ordem e condicionais', () => {
  const constraints = buildConstraints(config);
  assertEquals(constraints[0], 'Use only tool names listed under ## Tools');
  assertEquals(constraints[1], 'Use relative paths under the working directory; never .. or absolute paths outside workspace');
  assert(constraints.includes('High/medium risk tools require human approval'));
  assert(!constraints.some((c) => c.includes('READONLY mode')));

  const readonlyConfig: AgentConfig = { ...config, permissions: 'readonly' };
  const readonlyConstraints = buildConstraints(readonlyConfig);
  assert(readonlyConstraints.some((c) => c.includes('READONLY mode')));
  assert(!readonlyConstraints.some((c) => c.includes('require human approval')));
});

Deno.test('assertValidState lança para objective vazio', () => {
  const state = createInitialState('tarefa', config, []);
  const bad = { ...state, objective: '  ' };
  assertThrows(() => assertValidState(bad, config), StateInvariantError);
});

Deno.test('assertValidState lança para artifact com path absoluto', () => {
  const state = createInitialState('tarefa', config, []);
  const bad = {
    ...state,
    artifacts: [
      { path: '/etc/passwd', size: 1, source: 'write' as const, updatedAtIteration: 1 },
    ],
  };
  assertThrows(() => assertValidState(bad, config), StateInvariantError);
});

Deno.test('assertValidState lança para plan id duplicado', () => {
  const state = createInitialState('tarefa', config, []);
  const bad: AgentState = {
    ...state,
    plan: [
      { id: 'x', description: 'a', status: 'pending', note: '' },
      { id: 'x', description: 'b', status: 'pending', note: '' },
    ],
  };
  assertThrows(() => assertValidState(bad, config), StateInvariantError);
});
