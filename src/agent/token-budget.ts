import { ConfigurationError } from '../core/errors.ts';

export function estimateTokens(s: string): number {
  return Math.ceil(new TextEncoder().encode(s).length / 4);
}

export interface NumCtxConfig {
  numCtx: number | null;
  outputReserveTokens: number;
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
  } else {
    numCtx = 4096;
  }

  let outputReserve = config.outputReserveTokens;
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
