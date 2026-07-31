import { assertEquals, assertRejects } from '@std/assert';
import {
  estimateTokens,
  resolveNumCtx,
  resolveToolProtocolMode,
  shouldSendNativeTools,
} from '../../src/agent/token-budget.ts';
import { ConfigurationError } from '../../src/core/errors.ts';

Deno.test('estimateTokens: string vazia = 0', () => {
  assertEquals(estimateTokens(''), 0);
});

Deno.test('estimateTokens: 4 bytes = 1 token', () => {
  assertEquals(estimateTokens('abcd'), 1);
});

Deno.test('estimateTokens: 5 bytes = 2 tokens (ceil)', () => {
  assertEquals(estimateTokens('abcde'), 2);
});

Deno.test('resolveNumCtx: AUR_NUM_CTX tem prioridade', () => {
  const result = resolveNumCtx(
    { numCtx: 8192, outputReserveTokens: 512 },
    { AUR_NUM_CTX: '16384' },
    null,
  );
  assertEquals(result.numCtx, 16384);
  assertEquals(result.outputReserveTokens, 512);
  assertEquals(result.promptBudget, 16384 - 512);
});

Deno.test('resolveNumCtx: config.numCtx usado se env ausente', () => {
  const result = resolveNumCtx(
    { numCtx: 8192, outputReserveTokens: 512 },
    {},
    null,
  );
  assertEquals(result.numCtx, 8192);
});

Deno.test('resolveNumCtx: ollamaShowCtx usado se config null', () => {
  const result = resolveNumCtx(
    { numCtx: null, outputReserveTokens: 512 },
    {},
    32768,
  );
  assertEquals(result.numCtx, 32768);
});

Deno.test('resolveNumCtx: default 4096 se tudo null', () => {
  const result = resolveNumCtx(
    { numCtx: null, outputReserveTokens: 512 },
    {},
    null,
  );
  assertEquals(result.numCtx, 4096);
  assertEquals(result.promptBudget, 4096 - 512);
});

Deno.test('resolveNumCtx: adjust outputReserve se budget < 1024', () => {
  const result = resolveNumCtx(
    { numCtx: 1024, outputReserveTokens: 512 },
    {},
    null,
  );
  assertEquals(result.numCtx, 1024);
  // 512 < 1024 budget → adjust: min(256, floor(1024/4)) = 256
  assertEquals(result.outputReserveTokens, 256);
  assertEquals(result.promptBudget, 1024 - 256);
});

Deno.test('resolveNumCtx: ConfigurationError se budget < 512', async () => {
  await assertRejects(
    async () =>
      resolveNumCtx(
        { numCtx: 512, outputReserveTokens: 512 },
        {},
        null,
      ),
    ConfigurationError,
  );
});

Deno.test('resolveNumCtx: AUR_NUM_CTX invalido cai para config', () => {
  const result = resolveNumCtx(
    { numCtx: 8192, outputReserveTokens: 512 },
    { AUR_NUM_CTX: 'not-a-number' },
    null,
  );
  assertEquals(result.numCtx, 8192);
});

Deno.test('resolveToolProtocolMode: env override', () => {
  assertEquals(resolveToolProtocolMode('hybrid', { AUR_TOOL_PROTOCOL: 'pseudo' }), 'pseudo');
  assertEquals(resolveToolProtocolMode('hybrid', { AUR_TOOL_PROTOCOL: 'native' }), 'native');
});

Deno.test('resolveToolProtocolMode: config usado se env invalido', () => {
  assertEquals(resolveToolProtocolMode('native', { AUR_TOOL_PROTOCOL: 'invalid' }), 'native');
  assertEquals(resolveToolProtocolMode('hybrid', {}), 'hybrid');
});

Deno.test('shouldSendNativeTools: pseudo never sends', () => {
  assertEquals(shouldSendNativeTools('pseudo', 999999, 16384), false);
});

Deno.test('shouldSendNativeTools: native always sends', () => {
  assertEquals(shouldSendNativeTools('native', 4096, 16384), true);
});

Deno.test('shouldSendNativeTools: hybrid sends if numCtx >= minCtx', () => {
  assertEquals(shouldSendNativeTools('hybrid', 16384, 16384), true);
  assertEquals(shouldSendNativeTools('hybrid', 4096, 16384), false);
});
