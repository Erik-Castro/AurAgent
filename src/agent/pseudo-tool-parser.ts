import type { ToolCall } from '../core/types.ts';
import { parseToolArguments } from '../adapters/providers/parse-tool-args.ts';

export interface PseudoParseResult {
  calls: ToolCall[];
  /** Content com os trechos de tool call removidos; trimado. Pode ser "". */
  residualContent: string;
  errors: string[];
}

const FENCED_BLOCK_RE = /```(?:json)?\s*\n([\s\S]*?)```/g;

export function parsePseudoToolCalls(
  content: string,
  knownToolNames: ReadonlySet<string>,
): PseudoParseResult {
  if (content.trim() === '') {
    return { calls: [], residualContent: '', errors: [] };
  }

  const errors: string[] = [];

  const chosen = tryStrategyA(content, knownToolNames, errors) ??
    tryStrategyB(content, knownToolNames, errors) ??
    tryStrategyC(content, knownToolNames, errors);

  if (!chosen) {
    return { calls: [], residualContent: content.trim(), errors: dedupe(errors) };
  }

  const residual = content.replace(chosen.raw, '').trim();
  return { calls: [chosen.call], residualContent: residual, errors: dedupe(errors) };
}

function dedupe(errors: string[]): string[] {
  return [...new Set(errors)];
}

interface ChosenCall {
  call: ToolCall;
  raw: string;
}

function tryStrategyA(
  content: string,
  knownToolNames: ReadonlySet<string>,
  errors: string[],
): ChosenCall | null {
  FENCED_BLOCK_RE.lastIndex = 0;
  for (const match of content.matchAll(FENCED_BLOCK_RE)) {
    const call = tryParseToolObject(match[1], knownToolNames, errors);
    if (call) return { call, raw: match[0] };
  }
  return null;
}

function tryStrategyB(
  content: string,
  knownToolNames: ReadonlySet<string>,
  errors: string[],
): ChosenCall | null {
  const call = tryParseToolObject(content.trim(), knownToolNames, errors);
  return call ? { call, raw: content.trim() } : null;
}

function tryStrategyC(
  content: string,
  knownToolNames: ReadonlySet<string>,
  errors: string[],
): ChosenCall | null {
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== '{') continue;
    const candidate = extractBalancedJson(content, i);
    if (candidate === null) continue;
    const call = tryParseToolObject(candidate, knownToolNames, errors);
    if (call) return { call, raw: candidate };
  }
  return null;
}

function extractBalancedJson(content: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseToolObject(
  raw: string,
  knownToolNames: ReadonlySet<string>,
  errors: string[],
): ToolCall | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== 'string') return null;
  if (!knownToolNames.has(obj.name)) return null;
  if (typeof obj.arguments !== 'string' && typeof obj.arguments !== 'object') {
    return null;
  }
  if (obj.arguments === null) return null;

  let args: Record<string, unknown>;
  try {
    args = parseToolArguments(obj.arguments);
  } catch (err) {
    errors.push(
      `Pseudo tool args inválidos para "${obj.name}": ${(err as Error).message}`,
    );
    return null;
  }

  return {
    id: crypto.randomUUID(),
    name: obj.name,
    args,
  };
}
