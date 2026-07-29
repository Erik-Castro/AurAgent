import { assertEquals, assert } from '@std/assert';
import {
  truncateContent,
  buildAgeSummary,
  buildSessionSummary,
} from '../../src/agent/summarizer.ts';
import type { Message } from '../../src/core/types.ts';
import type { AgentResult } from '../../src/agent/agent.ts';

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

Deno.test('buildAgeSummary gera resumo com previews', () => {
  const messages: Message[] = [
    { role: 'user', content: 'faça algo' },
    {
      role: 'assistant',
      content: 'vou fazer\nem duas linhas',
      toolCalls: [{ id: 'c1', name: 'bash', args: {} }],
    },
    { role: 'tool', content: 'resultado', toolCallId: 'c1' },
  ];
  const summary = buildAgeSummary(messages);
  assert(summary.startsWith('[Resumo de ações anteriores]'));
  assert(summary.includes('[user]: faça algo'));
  assert(summary.includes('[assistant]: vou fazer em duas linhas'));
  assert(summary.includes('[tool]: resultado'));
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
