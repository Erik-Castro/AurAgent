import { assertEquals, assertThrows } from '@std/assert';
import { parseToolArguments } from '../../src/adapters/providers/parse-tool-args.ts';

Deno.test('parseToolArguments retorna {} para null/undefined', () => {
  assertEquals(parseToolArguments(null), {});
  assertEquals(parseToolArguments(undefined), {});
});

Deno.test('parseToolArguments retorna {} para string vazia', () => {
  assertEquals(parseToolArguments(''), {});
  assertEquals(parseToolArguments('   '), {});
});

Deno.test('parseToolArguments faz parse de JSON string', () => {
  const result = parseToolArguments('{"path":"test.ts","content":"abc"}');
  assertEquals(result, { path: 'test.ts', content: 'abc' });
});

Deno.test('parseToolArguments aceita objeto direto', () => {
  const obj = { path: 'a.ts', content: 'x' };
  assertEquals(parseToolArguments(obj), obj);
});

Deno.test('parseToolArguments lança para JSON array', () => {
  assertThrows(
    () => parseToolArguments('[1,2,3]'),
    Error,
    'must be an object',
  );
});

Deno.test('parseToolArguments lança para JSON primitivo', () => {
  assertThrows(
    () => parseToolArguments('"hello"'),
    Error,
    'must be an object',
  );
});

Deno.test('parseToolArguments lança para number', () => {
  assertThrows(
    () => parseToolArguments(42),
    Error,
    'must be object or JSON string',
  );
});
