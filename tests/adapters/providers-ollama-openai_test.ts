import { assertEquals, assert } from '@std/assert';
import type { GenerateRequest } from '../../src/core/types.ts';
import { OllamaProvider } from '../../src/adapters/providers/ollama-provider.ts';
import { OpenAIProvider } from '../../src/adapters/providers/openai-provider.ts';
import type { ProviderConfig } from '../../src/adapters/providers/config.ts';

const baseConfig: ProviderConfig = {
  baseUrl: 'http://127.0.0.1:1',
  model: 'test-model',
  defaultMaxTokens: 100,
  defaultTemperature: 0.5,
};

Deno.test('OllamaProvider generate retorna erro quando servidor offline', async () => {
  const provider = new OllamaProvider(baseConfig);
  const request: GenerateRequest = {
    messages: [
      { role: 'system', content: 'seja util' },
      { role: 'user', content: 'hello' },
    ],
  };
  const response = await provider.generate(request);
  assertEquals(response.finishReason, 'error');
  assert(response.content.length > 0, 'deve conter mensagem de erro');
});

Deno.test('OllamaProvider stream retorna erro estruturado', async () => {
  const provider = new OllamaProvider(baseConfig);
  const stream = provider.stream({
    messages: [{ role: 'user', content: 'hi' }],
  });
  const reader = stream.getReader();
  const events: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value.type);
  }
  assert(events.includes('error'));
});

Deno.test('OpenAIProvider generate retorna erro quando servidor offline', async () => {
  const provider = new OpenAIProvider({ ...baseConfig, apiKey: 'test-key' });
  const request: GenerateRequest = {
    messages: [{ role: 'user', content: 'hello' }],
  };
  const response = await provider.generate(request);
  assertEquals(response.finishReason, 'error');
});

function mockShowResponse(body: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test('OllamaProvider getContextWindow lê chave por arquitetura (qwen2.context_length)', async () => {
  const restore = mockShowResponse({
    model_info: { 'qwen2.context_length': 32768 },
  });
  try {
    const provider = new OllamaProvider(baseConfig);
    const result = await provider.getContextWindow();
    assertEquals(result, 32768);
  } finally {
    restore();
  }
});

Deno.test('OllamaProvider getContextWindow prefere parameters.num_ctx', async () => {
  const restore = mockShowResponse({
    model_info: { 'llama.context_length': 131072 },
    parameters: { num_ctx: 8192 },
  });
  try {
    const provider = new OllamaProvider(baseConfig);
    const result = await provider.getContextWindow();
    assertEquals(result, 8192);
  } finally {
    restore();
  }
});

Deno.test('OllamaProvider getContextWindow retorna null sem info válida', async () => {
  const restore = mockShowResponse({ model_info: {} });
  try {
    const provider = new OllamaProvider(baseConfig);
    const result = await provider.getContextWindow();
    assertEquals(result, null);
  } finally {
    restore();
  }
});
