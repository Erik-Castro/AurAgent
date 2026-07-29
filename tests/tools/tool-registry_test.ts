import { assertEquals } from '@std/assert';
import { ToolRegistry } from '../../src/core/tool-registry.ts';
import type { ToolDefinition } from '../../src/core/types.ts';

const makeTool = (name: string): ToolDefinition => ({
  name,
  description: `tool ${name}`,
  parameters: { type: 'object', properties: {} },
});

Deno.test('register + get retorna definição', () => {
  const r = new ToolRegistry();
  r.register(makeTool('bash'));
  const tool = r.get('bash')!;
  assertEquals(tool.name, 'bash');
  assertEquals(tool.description, 'tool bash');
});

Deno.test('getAll retorna todas', () => {
  const r = new ToolRegistry();
  r.register(makeTool('a'));
  r.register(makeTool('b'));
  assertEquals(r.getAll().length, 2);
});

Deno.test('has retorna true/false', () => {
  const r = new ToolRegistry();
  r.register(makeTool('read'));
  assertEquals(r.has('read'), true);
  assertEquals(r.has('write'), false);
});

Deno.test('remove retorna true e get retorna undefined', () => {
  const r = new ToolRegistry();
  r.register(makeTool('temp'));
  assertEquals(r.remove('temp'), true);
  assertEquals(r.get('temp'), undefined);
});

Deno.test('remove de inexistente retorna false', () => {
  const r = new ToolRegistry();
  assertEquals(r.remove('nonexistent'), false);
});
