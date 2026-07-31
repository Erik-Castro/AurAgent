import { assert, assertEquals, assertThrows } from '@std/assert';
import type { AgentConfig } from '../../src/core/types.ts';
import { PromptBudgetExceededError } from '../../src/core/errors.ts';
import { TOOL_PROTOCOL_BLOCK } from '../../src/core/constants.ts';
import { buildToolRegistry } from '../../src/tools/register.ts';
import { buildPromptFromState } from '../../src/agent/prompt-builder.ts';
import { createInitialState, applyToolResults } from '../../src/agent/state-transitions.ts';
import type { AgentState } from '../../src/agent/state.ts';
import { estimateTokens } from '../../src/agent/token-budget.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';
import { truncateContent } from '../../src/agent/summarizer.ts';

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

const promptBudget = 4096 - 512;

async function heavyState(): Promise<AgentState> {
  const ws = new MemoryWorkspace();
  const bigObs = truncateContent(JSON.stringify({
    query: 'gohorse',
    results: Array.from({ length: 20 }, (_, i) => ({
      title: `Result ${i}: gohorse pattern full documentation`,
      url: `https://example.com/${i}`,
      snippet: 'detailed content '.repeat(40),
    })),
  }, null, 2), 2000);

  let state = createInitialState(
    'Write a helloworld.js file using WriteFile in a project',
    config,
    Array.from({ length: 10 }, (_, i) => ({
      path: `file${i}.js`,
      size: i * 10,
      source: 'preexisting' as const,
      updatedAtIteration: 0,
    })),
  );

  for (let i = 1; i <= 3; i++) {
    state.iteration = i;
    state = await applyToolResults(
      state,
      [{ id: `c${i}`, name: 'ReadFile', args: { paths: [`file${i}.js`] } }],
      [{ callId: `c${i}`, output: bigObs, toolName: 'ReadFile' }],
      ws,
      config,
    );
  }
  return state;
}

Deno.test('buildPromptFromState retorna system + user apenas', async () => {
  const state = await heavyState();
  const defs = buildToolRegistry().registry.getAll();
  const result = buildPromptFromState(state, config, defs, TOOL_PROTOCOL_BLOCK, { promptBudget });

  assertEquals(result.messages.length, 2);
  assertEquals(result.messages[0].role, 'system');
  assertEquals(result.messages[1].role, 'user');
});

Deno.test('buildPromptFromState inclui Objective integral', async () => {
  const state = await heavyState();
  const defs = buildToolRegistry().registry.getAll();
  const result = buildPromptFromState(state, config, defs, TOOL_PROTOCOL_BLOCK, { promptBudget });

  const user = result.messages[1].content;
  assert(user.includes('## Objective'));
  assert(user.includes(state.objective));
});

Deno.test('buildPromptFromState cabe no budget com fixture pesada', async () => {
  const state = await heavyState();
  const defs = buildToolRegistry().registry.getAll();
  const result = buildPromptFromState(state, config, defs, TOOL_PROTOCOL_BLOCK, { promptBudget });

  assert(result.tokensEst <= promptBudget, `tokensEst=${result.tokensEst} > budget=${promptBudget}`);
  const actual = estimateTokens(result.messages[0].content) + estimateTokens(result.messages[1].content);
  assertEquals(result.tokensEst, actual);
});

Deno.test('buildPromptFromState corta seções quando estoura budget', async () => {
  const state = await heavyState();
  const defs = buildToolRegistry().registry.getAll();
  const result = buildPromptFromState(state, config, defs, TOOL_PROTOCOL_BLOCK, { promptBudget: 900 });

  assert(result.tokensEst <= 900);
  // primeiro cut da escada (§3.5.4): Recent actions some
  const user = result.messages[1].content;
  assert(!user.includes('## Recent actions'));
  assert(user.includes('## Objective'));
  assert(user.includes('## Open errors'));
});

Deno.test('buildPromptFromState lança PromptBudgetExceededError para budget irreal', async () => {
  const state = await heavyState();
  const defs = buildToolRegistry().registry.getAll();
  assertThrows(
    () => buildPromptFromState(state, config, defs, TOOL_PROTOCOL_BLOCK, { promptBudget: 50 }),
    PromptBudgetExceededError,
  );
});

Deno.test('buildPromptFromState sem actions nem artifacts monta user com (none)', () => {
  const state = createInitialState('Write a helloworld.js file', config, []);
  const defs = buildToolRegistry().registry.getAll();
  const result = buildPromptFromState(state, config, defs, TOOL_PROTOCOL_BLOCK, { promptBudget });

  const user = result.messages[1].content;
  assert(user.includes('## Workspace artifacts\n(none)'));
  assert(user.includes('## Last action\n(none)'));
  assert(user.includes('## Open errors\n(none)'));
});
