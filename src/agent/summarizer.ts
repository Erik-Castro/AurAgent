import type { Message } from '../core/types.ts';
import type { AgentResult } from './agent.ts';
import type { AgentState } from './state.ts';
import {
  extractSummaryFromMessages,
  extractSummaryFromState,
  renderSummary,
} from './summary-format.ts';

export function truncateContent(
  content: string,
  thresholdTokens: number,
): string {
  const maxChars = thresholdTokens * 4;
  if (content.length <= maxChars) return content;

  const half = Math.floor(maxChars / 2);
  const start = content.slice(0, half);
  const end = content.slice(-half);
  const omitted = content.length - maxChars;

  return `${start}\n\n[... conteúdo truncado, ${omitted} caracteres omitidos ...]\n\n${end}`;
}

export function buildCompactionSummary(state: AgentState, messages?: Message[]): string;
export function buildCompactionSummary(messages: Message[], state?: AgentState): string;
export function buildCompactionSummary(
  arg1: Message[] | AgentState,
  arg2?: Message[] | AgentState,
): string {
  if (Array.isArray(arg1)) {
    // buildCompactionSummary(messages, state?)
    const messages = arg1;
    const state = arg2 as AgentState | undefined;
    const summary = state
      ? extractSummaryFromState(state, messages)
      : extractSummaryFromMessages(messages);
    return renderSummary(summary);
  }
  // buildCompactionSummary(state, messages?)
  const state = arg1;
  const messages = arg2 as Message[] | undefined;
  const summary = extractSummaryFromState(state, messages);
  return renderSummary(summary);
}

export function buildSessionSummary(
  task: string,
  result: AgentResult,
  messageCount: number,
  summary?: string,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    task,
    status: result.status,
    iterations: result.iterations,
    durationMs: result.durationMs,
    timestamp: Date.now(),
    messageCount,
  };
  if (summary) {
    base.compactionSummary = summary;
  }
  return base;
}
