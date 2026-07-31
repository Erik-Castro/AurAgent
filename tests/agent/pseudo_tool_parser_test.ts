import { assertEquals } from '@std/assert';
import { parsePseudoToolCalls } from '../../src/agent/pseudo-tool-parser.ts';

const KNOWN = new Set(['WriteFile', 'ReadFile', 'WebSearch']);

Deno.test('G1: objeto JSON puro com arguments objeto', () => {
  const content = '{"name":"WriteFile","arguments":{"path":"a.js","content":"x"}}';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 1);
  assertEquals(result.calls[0].name, 'WriteFile');
  assertEquals(result.calls[0].args, { path: 'a.js', content: 'x' });
  assertEquals(result.residualContent, '');
});

Deno.test('G2: fenced block json', () => {
  const content = '```json\n{"name":"WebSearch","arguments":{"query":"gohorse"}}\n```';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 1);
  assertEquals(result.calls[0].name, 'WebSearch');
  assertEquals(result.calls[0].args, { query: 'gohorse' });
});

Deno.test('G3: texto antes + JSON (primeiro objeto válido)', () => {
  const content =
    'Vou criar o arquivo.\n{"name":"WriteFile","arguments":{"path":"h.js","content":"console.log(1)"}}';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 1);
  assertEquals(result.calls[0].name, 'WriteFile');
  assertContains(result.residualContent, 'Vou criar');
  assertNotContains(result.residualContent, '"name"');
});

Deno.test('G4: nome fora do registry → 0 calls, texto residual', () => {
  const content = '{"name":"NotATool","arguments":{}}';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 0);
  assertEquals(result.residualContent, content.trim());
});

Deno.test('G5: arguments inválido → erro de parse de args', () => {
  const content = '{"name":"WriteFile","arguments":"not-an-object"}';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 0);
  assertEquals(result.errors.length, 1);
});

Deno.test('G6: texto sem JSON → 0 calls', () => {
  const result = parsePseudoToolCalls('apenas texto comum', KNOWN);
  assertEquals(result.calls.length, 0);
  assertEquals(result.residualContent, 'apenas texto comum');
});

Deno.test('G7: dois JSONs válidos → apenas o primeiro', () => {
  const content =
    '{"name":"ReadFile","arguments":{"paths":["a.ts"]}}\n{"name":"WebSearch","arguments":{"query":"x"}}';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 1);
  assertEquals(result.calls[0].name, 'ReadFile');
});

Deno.test('G8: JSON com espaços', () => {
  const content = '{"name": "ReadFile", "arguments": {"paths": ["a.ts"]}}';
  const result = parsePseudoToolCalls(content, KNOWN);
  assertEquals(result.calls.length, 1);
  assertEquals(result.calls[0].name, 'ReadFile');
  assertEquals(result.calls[0].args, { paths: ['a.ts'] });
});

Deno.test('content vazio → sem calls, sem erros', () => {
  const result = parsePseudoToolCalls('', KNOWN);
  assertEquals(result.calls.length, 0);
  assertEquals(result.residualContent, '');
  assertEquals(result.errors.length, 0);
});

function assertContains(haystack: string, needle: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`expected "${haystack}" to contain "${needle}"`);
  }
}

function assertNotContains(haystack: string, needle: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`expected "${haystack}" NOT to contain "${needle}"`);
  }
}
