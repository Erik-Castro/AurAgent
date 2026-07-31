import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  estimateTokens,
  maxTokensOut,
  resolveNumCtx,
  resolveToolProtocolMode,
  shouldSendNativeTools,
  trimMessagesToBudget,
} from '../../src/agent/token-budget.ts';
import { ConfigurationError } from '../../src/core/errors.ts';
import type { Message } from '../../src/core/types.ts';

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

Deno.test('resolveNumCtx: ConfigurationError se budget < 512', () => {
  assertThrows(
    () =>
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

Deno.test('maxTokensOut: limitado a outputReserveTokens', () => {
  assertEquals(maxTokensOut(512), 512);
  assertEquals(maxTokensOut(256), 256);
});

Deno.test('maxTokensOut: não excede default 4096', () => {
  assertEquals(maxTokensOut(8192), 4096);
});

Deno.test('trimMessagesToBudget: remove mensagens antigas quando estoura', () => {
  const messages: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'task original' },
    { role: 'user', content: 'a'.repeat(400) },
    { role: 'user', content: 'b'.repeat(400) },
  ];
  // sys(1) + task(3) + a(100) + b(100) = 204 tokens; budget 100 força remover ambas.
  const result = trimMessagesToBudget(messages, 100, 'task original', 2000);
  assertEquals(result.exceeded, false);
  const remaining = result.messages.map((m) => m.content).join('|');
  assert(remaining.includes('task original'));
  assert(!remaining.includes('a'.repeat(400)));
  assert(!remaining.includes('b'.repeat(400)));
});

Deno.test('trimMessagesToBudget: nunca remove a task original', () => {
  const messages: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'task original' },
    { role: 'user', content: 'x' },
  ];
  const result = trimMessagesToBudget(messages, 1, 'task original', 2000);
  assert(result.messages.some((m) => m.content === 'task original'));
});

Deno.test('trimMessagesToBudget: system não é removido', () => {
  const messages: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'task' },
    { role: 'user', content: 'x' },
  ];
  const result = trimMessagesToBudget(messages, 1, 'task', 2000);
  assert(result.messages[0]?.role === 'system');
});

Deno.test('trimMessagesToBudget: observations truncadas por summaryTokenThreshold', () => {
  const messages: Message[] = [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'task' },
    { role: 'tool', content: 'o'.repeat(1000), toolCallId: 't1' },
  ];
  const result = trimMessagesToBudget(messages, 200, 'task', 50);
  assertEquals(result.messages[2].content.length < 1000, true);
  assert(result.messages[2].content.includes('[contexto truncado]'));
});
