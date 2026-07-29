import { assertEquals, assert } from '@std/assert';
import type { GenerateRequest } from '../../src/core/types.ts';
import { AnthropicProvider } from '../../src/adapters/providers/anthropic-provider.ts';
import { GeminiProvider } from '../../src/adapters/providers/gemini-provider.ts';
import type { ProviderConfig } from '../../src/adapters/providers/config.ts';

const baseConfig: ProviderConfig = {
  baseUrl: 'http://127.0.0.1:1',
  model: 'test-model',
  defaultMaxTokens: 100,
  defaultTemperature: 0.5,
};

Deno.test('AnthropicProvider generate com servidor offline', async () => {
  const provider = new AnthropicProvider({ ...baseConfig, apiKey: 'test-key' });
  const request: GenerateRequest = {
    messages: [{ role: 'user', content: 'hello' }],
  };
  const response = await provider.generate(request);
  assertEquals(response.finishReason, 'error');
});

Deno.test('AnthropicProvider stream retorna erro estruturado', async () => {
  const provider = new AnthropicProvider({ ...baseConfig, apiKey: 'test-key' });
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

Deno.test('GeminiProvider generate com servidor offline', async () => {
  const provider = new GeminiProvider({ ...baseConfig, apiKey: 'test-key' });
  const request: GenerateRequest = {
    messages: [{ role: 'user', content: 'hello' }],
  };
  const response = await provider.generate(request);
  assertEquals(response.finishReason, 'error');
});

Deno.test('GeminiProvider stream retorna erro estruturado', async () => {
  const provider = new GeminiProvider({ ...baseConfig, apiKey: 'test-key' });
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
