import { assert, assertEquals } from '@std/assert';
import { OllamaProvider } from '../../src/adapters/providers/ollama-provider.ts';
import type { ProviderConfig } from '../../src/adapters/providers/config.ts';
import type { ModelEvent } from '../../src/core/types.ts';

const config: ProviderConfig = {
  baseUrl: 'http://127.0.0.1:1',
  model: 'lfm2.5-thinking:latest',
  defaultMaxTokens: 100,
  defaultTemperature: 0.5,
};

function serveFixture(path: string): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    const body = await Deno.readTextFile(path);
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

async function collect(provider: OllamaProvider): Promise<ModelEvent[]> {
  const stream = provider.stream({
    messages: [{ role: 'user', content: 'Say hi' }],
    maxTokens: 100,
  });
  const reader = stream.getReader();
  const events: ModelEvent[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value);
  }
  return events;
}

const FIXTURES = new URL('../fixtures/ollama/', import.meta.url).pathname;

Deno.test('T1: stream thinking-only emite eventos thinking e content efetivo não vazio', async () => {
  const restore = serveFixture(`${FIXTURES}nemotron-stream-thinking-only.ndjson`);
  try {
    const provider = new OllamaProvider(config);
    const events = await collect(provider);

    const thinking = events.filter((e) => e.type === 'thinking');
    assert(thinking.length >= 1, 'deve emitir ao menos 1 evento thinking');
    const thinkingText = thinking.map((e) => (e as { text: string }).text).join('');
    assert(thinkingText.trim().length > 0);

    const tokens = events.filter((e) => e.type === 'token');
    const contentText = tokens.map((e) => (e as { text: string }).text).join('');
    // effective content = content se não vazio; senão thinking (fallback)
    const effective = contentText.trim() !== '' ? contentText : thinkingText;
    assert(effective.trim().length > 0, 'effective content não deve ser vazio');

    const done = events.find((e) => e.type === 'done');
    assert(done !== undefined);
    assertEquals((done as { finishReason: string }).finishReason, 'stop');
  } finally {
    restore();
  }
});

Deno.test('T2: stream content-only emite tokens e zero thinking', async () => {
  const restore = serveFixture(`${FIXTURES}qwen-stream-content-only.ndjson`);
  try {
    const provider = new OllamaProvider(config);
    const events = await collect(provider);

    const tokens = events.filter((e) => e.type === 'token');
    assert(tokens.length > 0, 'deve emitir tokens de content');
    const thinking = events.filter((e) => e.type === 'thinking');
    assertEquals(thinking.length, 0, 'fixture sem thinking não deve emitir thinking');
  } finally {
    restore();
  }
});

Deno.test('T3: tool_calls em chunk done:false emitidos com dedup (count === 1)', async () => {
  const restore = serveFixture(`${FIXTURES}stream-tool-calls-mid.ndjson`);
  try {
    const provider = new OllamaProvider(config);
    const events = await collect(provider);

    const calls = events.filter((e) => e.type === 'tool_call');
    assertEquals(calls.length, 1, 'tool_call duplicado deve ser deduplicado');
    const call = (calls[0] as { call: { name: string; args: Record<string, unknown> } }).call;
    assertEquals(call.name, 'WriteFile');
    assertEquals(call.args.path, 'helloworld.js');
  } finally {
    restore();
  }
});

Deno.test('T4: generate non-stream devolve content "hi" (não só thinking)', async () => {
  const body = await Deno.readTextFile(`${FIXTURES}nemotron-nonstream-final.json`);
  const original = globalThis.fetch;
  globalThis.fetch = (() => new Response(body, { status: 200 })) as unknown as typeof fetch;
  try {
    const provider = new OllamaProvider(config);
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Say hi in one word' }],
    });
    assertEquals(response.content, 'hi');
    assert(response.thinking !== undefined && response.thinking.length > 0);
    assertEquals(response.finishReason, 'stop');
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('T5: generate content vazio + thinking vira effective content === thinking', async () => {
  const body = JSON.stringify({
    message: {
      role: 'assistant',
      content: '',
      thinking: 'We are to say hi in one word.',
    },
    done: true,
    done_reason: 'stop',
  });
  const original = globalThis.fetch;
  globalThis.fetch = (() => new Response(body, { status: 200 })) as unknown as typeof fetch;
  try {
    const provider = new OllamaProvider(config);
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Say hi in one word' }],
    });
    assertEquals(response.content, 'We are to say hi in one word.');
    assertEquals(response.thinking, 'We are to say hi in one word.');
  } finally {
    globalThis.fetch = original;
  }
});
