import { assert } from '@std/assert';
import { OllamaProvider } from '../../src/adapters/providers/ollama-provider.ts';
import { OpenAIProvider } from '../../src/adapters/providers/openai-provider.ts';
import { AnthropicProvider } from '../../src/adapters/providers/anthropic-provider.ts';
import { GeminiProvider } from '../../src/adapters/providers/gemini-provider.ts';

Deno.test('createModelProvider detecta ollama', async () => {
  const { createModelProvider } = await import('../../src/adapters/providers/factory.ts');
  const provider = createModelProvider('ollama/qwen2.5-coder:7b');
  assert(provider instanceof OllamaProvider);
});

Deno.test('createModelProvider detecta openai', async () => {
  const { createModelProvider } = await import('../../src/adapters/providers/factory.ts');
  const provider = createModelProvider('openai/gpt-4o');
  assert(provider instanceof OpenAIProvider);
});

Deno.test('createModelProvider detecta anthropic', async () => {
  const { createModelProvider } = await import('../../src/adapters/providers/factory.ts');
  const provider = createModelProvider('anthropic/claude-sonnet-4-20250514');
  assert(provider instanceof AnthropicProvider);
});

Deno.test('createModelProvider detecta gemini', async () => {
  const { createModelProvider } = await import('../../src/adapters/providers/factory.ts');
  const provider = createModelProvider('gemini/gemini-2.5-flash');
  assert(provider instanceof GeminiProvider);
});

Deno.test('createModelProvider usa modelo default quando apenas prefixo', async () => {
  const { createModelProvider } = await import('../../src/adapters/providers/factory.ts');
  const provider = createModelProvider('ollama');
  assert(provider instanceof OllamaProvider);
});

Deno.test('createModelProvider lança para provider desconhecido', async () => {
  const { createModelProvider } = await import('../../src/adapters/providers/factory.ts');
  try {
    createModelProvider('unknown/model');
    assert(false, 'deveria ter lançado');
  } catch (err) {
    assert((err as Error).message.includes('Unknown provider'));
  }
});
