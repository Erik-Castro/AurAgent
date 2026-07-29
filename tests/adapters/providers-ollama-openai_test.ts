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
