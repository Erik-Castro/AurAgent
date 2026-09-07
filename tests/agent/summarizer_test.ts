import { assertEquals, assert, assertStringIncludes } from '@std/assert';
import {
  truncateContent,
  buildCompactionSummary,
  buildSessionSummary,
} from '../../src/agent/summarizer.ts';
import type { Message } from '../../src/core/types.ts';
import type { AgentResult } from '../../src/agent/agent.ts';
import type { AgentState } from '../../src/agent/state.ts';

function makeState(overrides?: Partial<AgentState>): AgentState {
  return {
    objective: 'Fix auth bug',
    acceptance: ['Bug fixed'],
    plan: [],
    artifacts: [],
    recentActions: [],
    lastAction: null,
    openErrors: [],
    constraints: [],
    iteration: 1,
    flags: {
      lastWriteGateFailed: false,
      sterileStop: false,
      readonly: false,
    },
    ...overrides,
  };
}

Deno.test('truncateContent não modifica texto curto', () => {
  const text = 'texto curto';
  assertEquals(truncateContent(text, 1000), text);
});

Deno.test('truncateContent trunca texto longo mantendo início e fim', () => {
  const text = 'início.' + 'x'.repeat(500) + '.fim';
  const result = truncateContent(text, 10); // maxChars = 40
  assert(result.length < text.length);
  assert(result.startsWith('início.'));
  assert(result.endsWith('.fim'));
  assert(result.includes('truncado'));
});

Deno.test('buildCompactionSummary extrai resumo de messages', () => {
  const messages: Message[] = [
    { role: 'user', content: 'faça algo' },
    {
      role: 'assistant',
      content: 'vou fazer',
      toolCalls: [{ id: 'c1', name: 'WriteFile', args: { path: 'src/app.ts' } }],
    },
    { role: 'tool', content: 'ok', toolCallId: 'c1' },
  ];
  const summary = buildCompactionSummary(messages);
  assertStringIncludes(summary, '<compacted-summary>');
  assertStringIncludes(summary, 'faça algo');
  assertStringIncludes(summary, 'src/app.ts');
  assertStringIncludes(summary, '</compacted-summary>');
});

Deno.test('buildCompactionSummary extrai resumo de state', () => {
  const state = makeState({
    objective: 'Upgrade dependency',
    plan: [
      { id: 's1', description: 'Check compatibility', status: 'done', note: '' },
      { id: 's2', description: 'Update package.json', status: 'pending', note: '' },
    ],
    artifacts: [{ path: 'package.json', size: 500, source: 'write', updatedAtIteration: 1 }],
    lastAction: {
      iteration: 1,
      tool: 'ReadFile',
      ok: true,
      argsSummary: 'path=src/app.ts',
      observationSummary: 'file contents',
    },
  });
  const summary = buildCompactionSummary(state);
  assertStringIncludes(summary, '<compacted-summary>');
  assertStringIncludes(summary, 'Upgrade dependency');
  assertStringIncludes(summary, 'package.json');
  assertStringIncludes(summary, 'Update package.json');
  assertStringIncludes(summary, '</compacted-summary>');
});

Deno.test('buildCompactionSummary com state e messages usa extractSummaryFromState', () => {
  const state = makeState({ objective: 'Refactor module' });
  const messages: Message[] = [
    { role: 'user', content: 'old message' },
  ];
  const summary = buildCompactionSummary(state, messages);
  assertStringIncludes(summary, 'Refactor module');
  // Should use state objective, not message content
  assert(!summary.includes('old message'));
});

Deno.test('renderSummary gera todas as 8 seções', () => {
  const summary = buildCompactionSummary(makeState());
  const sections = [
    'Primary Request and Intent',
    'Key Technical Concepts',
    'Files and Code',
    'Errors and Fixes',
    'Pending Jobs',
    'Current Work',
    'Next Step',
    'Critical Context',
  ];
  for (const section of sections) {
    assertStringIncludes(summary, `## ${section}`);
  }
});

Deno.test('buildSessionSummary tem campos esperados', () => {
  const result: AgentResult = {
    status: 'success',
    output: 'feito',
    iterations: 3,
    durationMs: 1500,
  };
  const summary = buildSessionSummary('tarefa X', result, 10);
  assertEquals(summary.task, 'tarefa X');
  assertEquals(summary.status, 'success');
  assertEquals(summary.iterations, 3);
  assertEquals(summary.durationMs, 1500);
  assertEquals(summary.messageCount, 10);
  assertEquals(typeof summary.timestamp, 'number');
});

Deno.test('buildSessionSummary inclui compactionSummary quando fornecido', () => {
  const result: AgentResult = {
    status: 'success',
    output: 'feito',
    iterations: 3,
    durationMs: 1500,
  };
  const summary = buildSessionSummary('tarefa X', result, 10, '<compacted-summary>...</compacted-summary>');
  assertEquals(summary.compactionSummary, '<compacted-summary>...</compacted-summary>');
});

Deno.test('buildCompactionSummary lista files de tool calls', () => {
  const messages: Message[] = [
    { role: 'user', content: 'edit the file' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'c1', name: 'ReadFile', args: { path: 'src/main.ts' } },
        { id: 'c2', name: 'EditFile', args: { path: 'src/main.ts', oldString: 'a', newString: 'b' } },
      ],
    },
    { role: 'tool', content: 'ok', toolCallId: 'c1' },
  ];
  const summary = buildCompactionSummary(messages);
  assertStringIncludes(summary, 'src/main.ts');
});
