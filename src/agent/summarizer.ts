import type { Message } from '../core/types.ts';
import type { AgentResult } from './agent.ts';

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

export function buildAgeSummary(messages: Message[]): string {
  const lines = messages.map((m) => {
    const preview = m.content.slice(0, 150).replace(/\n/g, ' ');
    return `[${m.role}]: ${preview}`;
  });

  return `[Resumo de ações anteriores]\n${lines.join('\n')}`;
}

export function buildSessionSummary(
  task: string,
  result: AgentResult,
  messageCount: number,
): Record<string, unknown> {
  return {
    task,
    status: result.status,
    iterations: result.iterations,
    durationMs: result.durationMs,
    timestamp: Date.now(),
    messageCount,
  };
}
