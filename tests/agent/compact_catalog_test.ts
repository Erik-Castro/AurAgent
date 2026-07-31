import { assert, assertEquals } from '@std/assert';
import { buildCompactToolCatalog, TOOL_CATALOG_HEADER } from '../../src/tools/compact-catalog.ts';
import { estimateTokens } from '../../src/agent/token-budget.ts';
import type { ToolDefinition } from '../../src/core/types.ts';

function def(
  name: string,
  params: { required?: string[]; properties?: Record<string, unknown> },
  description = 'descrição',
): ToolDefinition {
  return {
    name,
    description,
    parameters: { ...params },
  };
}

const TOOLS: ToolDefinition[] = [
  def('ReadFile', {
    required: ['path'],
    properties: { path: { type: 'string' }, encoding: { type: 'string' } },
  }, 'Lê um arquivo do workspace'),
  def('WriteFile', {
    required: ['path', 'content'],
    properties: { path: { type: 'string' }, content: { type: 'string' } },
  }, 'Escreve conteúdo em um arquivo'),
];

Deno.test('buildCompactToolCatalog: header fixo presente', () => {
  const catalog = buildCompactToolCatalog(TOOLS, 600);
  assert(catalog.startsWith(TOOL_CATALOG_HEADER));
});

Deno.test('buildCompactToolCatalog: linhas na ordem com required e optional ?', () => {
  const catalog = buildCompactToolCatalog(TOOLS, 600);
  assert(catalog.includes('- ReadFile(path, encoding?) — Lê um arquivo'));
  assert(catalog.includes('- WriteFile(path, content) — Escreve conteúdo'));
});

Deno.test('buildCompactToolCatalog: description truncada a 80 chars com …', () => {
  const long = 'a'.repeat(120);
  const tools = [def('LongTool', { properties: {} }, long)];
  const catalog = buildCompactToolCatalog(tools, 600);
  assert(catalog.includes('- LongTool() — '));
  assert(!catalog.includes('a'.repeat(81)));
  assert(catalog.includes('…'));
});

Deno.test('buildCompactToolCatalog: teto de tokens é respeitado', () => {
  const many = Array.from(
    { length: 50 },
    (_, i) => def(`Tool${i}`, { required: ['a'], properties: { a: { type: 'string' } } }),
  );
  const catalog = buildCompactToolCatalog(many, 200);
  assertEquals(estimateTokens(catalog) <= 200, true);
  assert(catalog.startsWith('## Tools'));
});

Deno.test('buildCompactToolCatalog: vazio com maxTokens pequeno não quebra', () => {
  const catalog = buildCompactToolCatalog(TOOLS, 1);
  assert(typeof catalog === 'string');
});
