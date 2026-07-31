import { ConfigurationError } from '../core/errors.ts';
import type { Message } from '../core/types.ts';

export function estimateTokens(s: string): number {
  return Math.ceil(new TextEncoder().encode(s).length / 4);
}

export function maxTokensOut(
  outputReserveTokens: number,
  defaultMaxTokens = 4096,
): number {
  return Math.min(defaultMaxTokens, outputReserveTokens);
}

export interface NumCtxConfig {
  numCtx: number | null;
  outputReserveTokens: number;
  model?: string;
}

export function resolveNumCtx(
  config: NumCtxConfig,
  env: Record<string, string | undefined>,
  ollamaShowCtx: number | null,
): { numCtx: number; outputReserveTokens: number; promptBudget: number } {
  const min = 512;
  const max = 1_000_000;

  let numCtx: number;
  const envNumCtx = env.AUR_NUM_CTX ? parseInt(env.AUR_NUM_CTX, 10) : NaN;
  if (!isNaN(envNumCtx) && envNumCtx >= min && envNumCtx <= max) {
    numCtx = envNumCtx;
  } else if (
    config.numCtx !== null &&
    config.numCtx >= min &&
    config.numCtx <= max
  ) {
    numCtx = config.numCtx;
  } else if (ollamaShowCtx !== null && ollamaShowCtx >= min && ollamaShowCtx <= max) {
    numCtx = ollamaShowCtx;
  } else if (typeof config.model === 'string' && config.model.includes(':cloud')) {
    numCtx = 32768;
  } else {
    numCtx = 4096;
  }

  const envReserve = env.AUR_OUTPUT_RESERVE ? parseInt(env.AUR_OUTPUT_RESERVE, 10) : NaN;
  let outputReserve = !isNaN(envReserve) && envReserve > 0
    ? envReserve
    : config.outputReserveTokens;

  let promptBudget = numCtx - outputReserve;

  if (promptBudget < 1024) {
    outputReserve = Math.min(256, Math.floor(numCtx / 4));
    promptBudget = numCtx - outputReserve;
  }

  if (promptBudget < 512) {
    throw new ConfigurationError(
      `Contexto insuficiente: num_ctx=${numCtx}, prompt_budget=${promptBudget}`,
    );
  }

  return { numCtx, outputReserveTokens: outputReserve, promptBudget };
}

export function resolveToolProtocolMode(
  configMode: string,
  env: Record<string, string | undefined>,
): 'native' | 'pseudo' | 'hybrid' {
  const envMode = env.AUR_TOOL_PROTOCOL;
  if (envMode === 'native' || envMode === 'pseudo' || envMode === 'hybrid') {
    return envMode;
  }
  if (configMode === 'native' || configMode === 'pseudo' || configMode === 'hybrid') {
    return configMode;
  }
  return 'hybrid';
}

export function shouldSendNativeTools(
  mode: 'native' | 'pseudo' | 'hybrid',
  numCtx: number,
  hybridMinCtx: number,
): boolean {
  if (mode === 'pseudo') return false;
  if (mode === 'native') return true;
  // hybrid
  return numCtx >= hybridMinCtx;
}

const SUMMARY_MARKER = /^## Instruções de /;

function truncateSystemInstructions(systemContent: string, maxTokens: number): string {
  // Apenas a parte de "Instruções de <file>" (arquivos de workspace) pode ser
  // truncada; o bloco de protocolo §3.4 e o catálogo compacto são preservados.
  if (estimateTokens(systemContent) <= maxTokens) return systemContent;

  const baseParts: string[] = [];
  const instructionParts: string[] = [];
  let inInstruction = false;
  let current: string[] = [];

  for (const line of systemContent.split('\n')) {
    if (SUMMARY_MARKER.test(line)) {
      if (inInstruction && current.length > 0) {
        instructionParts.push(current.join('\n'));
        current = [];
      }
      inInstruction = true;
      current.push(line);
    } else if (line.startsWith('## ')) {
      if (inInstruction && current.length > 0) {
        instructionParts.push(current.join('\n'));
        current = [];
      }
      inInstruction = false;
      baseParts.push(line);
    } else if (inInstruction) {
      current.push(line);
    } else {
      baseParts.push(line);
    }
  }
  if (inInstruction && current.length > 0) {
    instructionParts.push(current.join('\n'));
  }

  let result = baseParts.join('\n');

  // Remove blocos de instrução do final até o total caber.
  const remaining = instructionParts.slice();
  while (
    remaining.length > 0 &&
    estimateTokens(joinParts(result, remaining)) > maxTokens
  ) {
    remaining.pop();
  }
  if (remaining.length > 0) {
    result = joinParts(result, remaining);
  }

  // Se ainda não couber (base + protocolo + catálogo), trunca pelo final.
  if (estimateTokens(result) > maxTokens && result.length > 0) {
    const budgetChars = maxTokens * 4;
    if (result.length > budgetChars) {
      result = result.slice(0, budgetChars);
    }
  }

  return result;
}

function joinParts(base: string, parts: string[]): string {
  return base + '\n' + parts.join('\n');
}

export interface TrimResult {
  messages: Message[];
  /** true se ainda excede o budget após todos os passos. */
  exceeded: boolean;
}

function findTaskMessageIndex(
  messages: Message[],
  taskContent: string,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && m.content === taskContent) return i;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

export function trimMessagesToBudget(
  messages: Message[],
  promptBudget: number,
  taskContent: string,
  summaryTokenThreshold: number,
): TrimResult {
  const msgs = messages.map((m) => ({ ...m }));
  const taskMessageIndex = findTaskMessageIndex(msgs, taskContent);
  const totalTokens = (): number => msgs.reduce((acc, m) => acc + estimateTokens(m.content), 0);

  let T = totalTokens();

  // 1. Remover mensagens antigas (role != tool, índice mínimo > system e ≠ task user).
  while (T > promptBudget) {
    const removableIdx = msgs.findIndex(
      (_m, i) => i > 0 && i !== taskMessageIndex && msgs[i].role !== 'tool',
    );
    if (removableIdx === -1) break;
    T -= estimateTokens(msgs[removableIdx].content);
    msgs.splice(removableIdx, 1);
  }

  // 2. Truncar parte de "Instruções de <file>" na mensagem system (índice 0).
  if (T > promptBudget && msgs[0]?.role === 'system') {
    const system = msgs[0];
    const budgetForSystem = promptBudget - (T - estimateTokens(system.content));
    const trimmed = truncateSystemInstructions(system.content, Math.max(0, budgetForSystem));
    if (trimmed !== system.content) {
      T = T - estimateTokens(system.content) + estimateTokens(trimmed);
      msgs[0] = { ...system, content: trimmed };
    }
  }

  // 3. Truncar observations (role=tool) mais antigas para summaryTokenThreshold.
  while (T > promptBudget) {
    const toolIdx = msgs.findIndex(
      (m, i) => m.role === 'tool' && i > 0 && i !== taskMessageIndex,
    );
    if (toolIdx === -1) break;
    const msg = msgs[toolIdx];
    const maxChars = summaryTokenThreshold * 4;
    if (msg.content.length <= maxChars) {
      msgs.splice(toolIdx, 1);
      continue;
    }
    const truncated = msg.content.slice(0, maxChars) + '\n… [contexto truncado]';
    T = T - estimateTokens(msg.content) + estimateTokens(truncated);
    msgs[toolIdx] = { ...msg, content: truncated };
  }

  return { messages: msgs, exceeded: T > promptBudget };
}
