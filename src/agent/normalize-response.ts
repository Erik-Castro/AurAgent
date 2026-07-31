import type { GenerateResponse } from '../core/types.ts';
import { parsePseudoToolCalls } from './pseudo-tool-parser.ts';

export function normalizeModelResponse(
  response: GenerateResponse,
  knownToolNames: ReadonlySet<string>,
): GenerateResponse {
  const native = (response.toolCalls ?? []).filter((c) => knownToolNames.has(c.name));

  if (native.length > 0) {
    return {
      content: response.content,
      toolCalls: native,
      finishReason: 'tool_calls',
    };
  }

  const parsed = parsePseudoToolCalls(response.content ?? '', knownToolNames);
  if (parsed.calls.length > 0) {
    return {
      content: parsed.residualContent,
      toolCalls: parsed.calls,
      finishReason: 'tool_calls',
    };
  }

  return {
    content: response.content,
    toolCalls: undefined,
    finishReason: response.finishReason === 'error'
      ? 'error'
      : response.finishReason === 'length'
      ? 'length'
      : 'stop',
  };
}
