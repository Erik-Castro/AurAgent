import { assert, assertEquals } from '@std/assert';
import type { GenerateResponse, Message } from '../../src/core/types.ts';
import type { EmbeddingProvider } from '../../src/ports/embedding-provider.ts';
import type { MemoryStore } from '../../src/ports/memory-store.ts';
import { PromptCache, cosineSimilarity, hashRequest } from '../../src/agent/prompt-cache.ts';
import { InMemoryEventBus } from '../../src/adapters/event-bus.ts';

class MockEmbeddings implements EmbeddingProvider {
  readonly dimensions = 3;
  readonly modelName = 'mock';
  private vectors: number[][];

  constructor(vectors: number[][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    this.vectors = vectors;
  }

  embed(input: string[]): Promise<number[][]> {
    // Deterministic: hash the input string to pick a vector
    return Promise.resolve(
      input.map((s) => {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        const idx = Math.abs(h) % this.vectors.length;
        return this.vectors[idx];
      }),
    );
  }
}

function mockResponse(content = 'hello'): GenerateResponse {
  return { content, finishReason: 'stop' };
}

function msgs(content: string): Message[] {
  return [{ role: 'user', content }];
}

function defaultConfig() {
  return { enabled: true, similarityThreshold: 0.92, maxEntries: 100, ttlMs: 3_600_000 };
}

Deno.test('cosineSimilarity: identical vectors = 1', () => {
  assertEquals(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
});

Deno.test('cosineSimilarity: orthogonal vectors = 0', () => {
  assertEquals(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
});

Deno.test('cosineSimilarity: empty vectors = 0', () => {
  assertEquals(cosineSimilarity([], []), 0);
});

Deno.test('hashRequest: deterministic', () => {
  const h1 = hashRequest('model', msgs('hi'), undefined, {});
  const h2 = hashRequest('model', msgs('hi'), undefined, {});
  assertEquals(h1, h2);
});

Deno.test('hashRequest: different content produces different hash', () => {
  const h1 = hashRequest('model', msgs('hi'), undefined, {});
  const h2 = hashRequest('model', msgs('bye'), undefined, {});
  assert(h1 !== h2);
});

Deno.test('PromptCache: miss on empty cache', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, defaultConfig());

  const result = await cache.lookup('model', msgs('hello'), undefined, {});
  assertEquals(result, null);
});

Deno.test('PromptCache: exact hit on same request', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, defaultConfig());

  await cache.store('model', msgs('hello'), undefined, {}, mockResponse('world'));

  const result = await cache.lookup('model', msgs('hello'), undefined, {});
  assert(result !== null);
  assertEquals(result!.response.content, 'world');
  assertEquals(result!.similarity, 1);
});

Deno.test('PromptCache: semantic hit on similar request', async () => {
  // Vectors that are similar (angle < threshold)
  const emb = new MockEmbeddings([
    [1, 0, 0],
    [0.98, 0.19, 0], // ~11 degrees from [1,0,0]
    [0, 0, 1],
  ]);
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, {
    enabled: true,
    similarityThreshold: 0.92,
    maxEntries: 100,
    ttlMs: 3_600_000,
  });

  // Store with vector [1,0,0]
  await cache.store('model', msgs('request_a'), undefined, {}, mockResponse('answer_a'));

  // Lookup with vector [0.98, 0.19, 0] — similar but not identical
  const result = await cache.lookup('model', msgs('request_b'), undefined, {});
  assert(result !== null);
  assert(result!.similarity >= 0.92);
  assertEquals(result!.response.content, 'answer_a');
});

Deno.test('PromptCache: miss on dissimilar request', async () => {
  const emb = new MockEmbeddings([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, defaultConfig());

  await cache.store('model', msgs('request_a'), undefined, {}, mockResponse('answer_a'));

  // Lookup with orthogonal vector — should miss
  const result = await cache.lookup('model', msgs('request_b'), undefined, {});
  // Depending on which vector the mock picks, this might be a semantic hit or miss
  // With orthogonal vectors (1,0,0) and (0,1,0), cosine = 0, so miss
  assertEquals(result, null);
});

Deno.test('PromptCache: LRU eviction on maxEntries', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, {
    enabled: true,
    similarityThreshold: 0.92,
    maxEntries: 3,
    ttlMs: 3_600_000,
  });

  await cache.store('model', msgs('a'), undefined, {}, mockResponse('a'));
  await cache.store('model', msgs('b'), undefined, {}, mockResponse('b'));
  await cache.store('model', msgs('c'), undefined, {}, mockResponse('c'));
  await cache.store('model', msgs('d'), undefined, {}, mockResponse('d'));

  const stats = cache.stats();
  assertEquals(stats.l1Size, 3); // evicted oldest
});

Deno.test('PromptCache: disabled returns null', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, {
    ...defaultConfig(),
    enabled: false,
  });

  const result = await cache.lookup('model', msgs('hello'), undefined, {});
  assertEquals(result, null);
});

Deno.test('PromptCache: noop embeddings disables semantic search', async () => {
  const noopEmb = { dimensions: 0, modelName: 'noop', embed: () => Promise.resolve([]) };
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(noopEmb, store, bus, defaultConfig());

  assert(!cache.enabled);
  const result = await cache.lookup('model', msgs('hello'), undefined, {});
  assertEquals(result, null);
});

Deno.test('PromptCache: invalidate removes entry', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, defaultConfig());

  const key = hashRequest('model', msgs('hello'), undefined, {});
  await cache.store('model', msgs('hello'), undefined, {}, mockResponse('world'));

  const hit = await cache.lookup('model', msgs('hello'), undefined, {});
  assert(hit !== null);

  await cache.invalidate(key);
  const afterInvalidate = await cache.lookup('model', msgs('hello'), undefined, {});
  assertEquals(afterInvalidate, null);
});

Deno.test('PromptCache: clear removes all', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, defaultConfig());

  await cache.store('model', msgs('hello'), undefined, {}, mockResponse('world'));
  await cache.store('model', msgs('bye'), undefined, {}, mockResponse('goodbye'));
  assertEquals(cache.stats().l1Size, 2);

  await cache.clear();
  assertEquals(cache.stats().l1Size, 0);
});

Deno.test('PromptCache: does not cache error responses', async () => {
  const emb = new MockEmbeddings();
  const kv = new Map<string, unknown>();
  const store: MemoryStore = {
    get: (k) => Promise.resolve(kv.get(k) as null),
    set: (k, v) => { kv.set(k, v); return Promise.resolve(); },
    delete: (k) => { kv.delete(k); return Promise.resolve(); },
    list: () => Promise.resolve([...kv.keys()]),
  };
  const bus = new InMemoryEventBus();
  const cache = new PromptCache(emb, store, bus, defaultConfig());

  await cache.store('model', msgs('hello'), undefined, {}, {
    content: 'error',
    finishReason: 'error',
  });

  const result = await cache.lookup('model', msgs('hello'), undefined, {});
  assertEquals(result, null);
});
