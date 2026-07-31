import type { ToolDefinition } from '../core/types.ts';
import { estimateTokens } from '../agent/token-budget.ts';

export const TOOL_CATALOG_HEADER =
  '## Tools\nEmit a tool call as a single JSON object with keys "name" and "arguments".';

const MAX_DESCRIPTION_CHARS = 80;

export function buildCompactToolCatalog(
  definitions: ToolDefinition[],
  maxTokens: number,
): string {
  const lines = definitions.map((t) => `- ${formatLine(t)}`);

  let catalog = TOOL_CATALOG_HEADER + '\n' + lines.join('\n');

  while (estimateTokens(catalog) > maxTokens && lines.length > 0) {
    lines.pop();
    catalog = TOOL_CATALOG_HEADER + '\n' + lines.join('\n');
  }

  if (estimateTokens(catalog) > maxTokens) {
    catalog = truncateHeaderToFit(catalog);
  }

  return catalog;
}

function truncateHeaderToFit(catalog: string): string {
  const minimum = '## Tools\n';
  while (estimateTokens(catalog) > 0 && catalog.length > minimum.length) {
    catalog = catalog.slice(0, -1);
  }
  return catalog.length >= minimum.length ? catalog : minimum;
}

function formatLine(t: ToolDefinition): string {
  const parameters = (t.parameters ?? {}) as Record<string, unknown>;
  const required = Array.isArray(parameters.required) ? (parameters.required as string[]) : [];
  const properties = (parameters.properties ?? {}) as Record<string, unknown>;
  const optional = Object.keys(properties).filter((k) => !required.includes(k));

  const params = [...required, ...optional.map((o) => `${o}?`)].join(', ');
  return `${t.name}(${params}) — ${truncateDescription(t.description)}`;
}

function truncateDescription(desc: string): string {
  if (desc.length <= MAX_DESCRIPTION_CHARS) return desc;
  return desc.slice(0, MAX_DESCRIPTION_CHARS) + '…';
}
