import { assertEquals } from '@std/assert';
import { normalizeModelResponse } from '../../src/agent/normalize-response.ts';
import type { GenerateResponse } from '../../src/core/types.ts';

const KNOWN = new Set(['WriteFile', 'ReadFile']);

Deno.test('normalize: native toolCalls conhecidas vencem', () => {
  const raw: GenerateResponse = {
    content: 'vou chamar',
    toolCalls: [{ id: 'a', name: 'WriteFile', args: { path: 'x' } }],
    finishReason: 'tool_calls',
  };
  const n = normalizeModelResponse(raw, KNOWN);
  assertEquals(n.toolCalls?.length, 1);
  assertEquals(n.finishReason, 'tool_calls');
  assertEquals(n.content, 'vou chamar');
});

Deno.test('normalize: toolCalls com nome desconhecido são descartadas', () => {
  const raw: GenerateResponse = {
    content: 'vou chamar',
    toolCalls: [{ id: 'a', name: 'NotATool', args: {} }],
    finishReason: 'tool_calls',
  };
  const n = normalizeModelResponse(raw, KNOWN);
  assertEquals(n.toolCalls, undefined);
  assertEquals(n.finishReason, 'stop');
});

Deno.test('normalize: pseudo no content vira tool_calls', () => {
  const raw: GenerateResponse = {
    content: '{"name":"ReadFile","arguments":{"paths":["a.ts"]}}',
    finishReason: 'stop',
  };
  const n = normalizeModelResponse(raw, KNOWN);
  assertEquals(n.toolCalls?.length, 1);
  assertEquals(n.toolCalls![0].name, 'ReadFile');
  assertEquals(n.finishReason, 'tool_calls');
});

Deno.test('normalize: sem tool calls → stop, conteúdo preservado', () => {
  const raw: GenerateResponse = { content: 'resposta normal', finishReason: 'stop' };
  const n = normalizeModelResponse(raw, KNOWN);
  assertEquals(n.toolCalls, undefined);
  assertEquals(n.finishReason, 'stop');
  assertEquals(n.content, 'resposta normal');
});

Deno.test('normalize: error é preservado', () => {
  const raw: GenerateResponse = { content: 'erro', finishReason: 'error' };
  const n = normalizeModelResponse(raw, KNOWN);
  assertEquals(n.finishReason, 'error');
});

Deno.test('normalize: length é preservado', () => {
  const raw: GenerateResponse = { content: 'longo', finishReason: 'length' };
  const n = normalizeModelResponse(raw, KNOWN);
  assertEquals(n.finishReason, 'length');
});
