import type { GenerateResponse, Message, ToolDefinition } from '../core/types.ts';
import type { EmbeddingProvider } from '../ports/embedding-provider.ts';
import type { EventBus } from '../ports/event-bus.ts';
import type { MemoryStore } from '../ports/memory-store.ts';

const L2_PREFIX = 'pc:';

export interface PromptCacheConfig {
  enabled: boolean;
  /** Cosine similarity threshold (0-1). Default: 0.92 */
  similarityThreshold: number;
  /** Max entries in L1 (in-memory). Default: 1000 */
  maxEntries: number;
  /** TTL in milliseconds. Default: 3600000 (1 hour) */
  ttlMs: number;
}

interface CacheEntry {
  embedding: number[];
  response: GenerateResponse;
  requestHash: string;
  timestamp: number;
}

interface CacheLookupResult {
  response: GenerateResponse;
  similarity: number;
  key: string;
}

export class PromptCache {
  private l1 = new Map<string, CacheEntry>();
  private l2Loaded = false;
  private accessOrder: string[] = [];

  constructor(
    private embeddingProvider: EmbeddingProvider,
    private l2: MemoryStore,
    private eventBus: EventBus,
    private config: PromptCacheConfig,
  ) {}

  /** Check if caching is enabled and the embedding provider is usable. */
  get enabled(): boolean {
    return this.config.enabled && this.embeddingProvider.dimensions > 0;
  }

  async lookup(
    model: string,
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    budget: { maxTokens?: number; numCtx?: number },
  ): Promise<CacheLookupResult | null> {
    if (!this.enabled) return null;

    const queryHash = hashRequest(model, messages, tools, budget);
    const embedding = await this.safeEmbed(messages);
    if (!embedding) return null;

    // Exact match in L1
    const exact = this.l1.get(queryHash);
    if (exact && !this.isExpired(exact)) {
      this.touchL1(queryHash);
      this.eventBus.emit('cache:hit', { key: queryHash, similarity: 1 });
      return { response: exact.response, similarity: 1, key: queryHash };
    }

    // Semantic search in L1
    const semantic = this.searchL1(embedding, queryHash);
    if (semantic) {
      this.eventBus.emit('cache:hit', {
        key: semantic.key,
        similarity: semantic.similarity,
      });
      return semantic;
    }

    // Load L2 into L1 and search again
    if (!this.l2Loaded) {
      await this.loadL2();
      const retrySemantic = this.searchL1(embedding, queryHash);
      if (retrySemantic) {
        this.eventBus.emit('cache:hit', {
          key: retrySemantic.key,
          similarity: retrySemantic.similarity,
        });
        return retrySemantic;
      }
    }

    this.eventBus.emit('cache:miss', { key: queryHash });
    return null;
  }

  async store(
    model: string,
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    budget: { maxTokens?: number; numCtx?: number },
    response: GenerateResponse,
  ): Promise<void> {
    if (!this.enabled) return;
    if (response.finishReason === 'error') return;

    const key = hashRequest(model, messages, tools, budget);
    const embedding = await this.safeEmbed(messages);
    if (!embedding) return;

    const entry: CacheEntry = {
      embedding,
      response,
      requestHash: key,
      timestamp: Date.now(),
    };

    this.l1.set(key, entry);
    this.touchL1(key);
    this.evictL1();

    // Fire-and-forget L2 write
    this.l2.set(`${L2_PREFIX}${key}`, entry).catch(() => {});

    this.eventBus.emit('cache:store', { key });
  }

  async invalidate(key: string): Promise<void> {
    this.l1.delete(key);
    await this.l2.delete(`${L2_PREFIX}${key}`).catch(() => {});
  }

  /** Clear all cache entries. */
  async clear(): Promise<void> {
    const keys = await this.l2.list(L2_PREFIX).catch(() => []);
    await Promise.allSettled(keys.map((k) => this.l2.delete(k)));
    this.l1.clear();
    this.accessOrder = [];
    this.l2Loaded = false;
  }

  stats(): { l1Size: number; l2Loaded: boolean } {
    return { l1Size: this.l1.size, l2Loaded: this.l2Loaded };
  }

  // --- Private ---

  private searchL1(
    embedding: number[],
    excludeKey: string,
  ): CacheLookupResult | null {
    if (embedding.length === 0 || this.l1.size === 0) return null;

    let bestKey: string | null = null;
    let bestSimilarity = 0;

    for (const [key, entry] of this.l1) {
      if (key === excludeKey) continue;
      if (this.isExpired(entry)) continue;
      if (entry.embedding.length !== embedding.length) continue;

      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestKey = key;
      }
    }

    if (bestKey && bestSimilarity >= this.config.similarityThreshold) {
      this.touchL1(bestKey);
      return {
        response: this.l1.get(bestKey)!.response,
        similarity: bestSimilarity,
        key: bestKey,
      };
    }

    return null;
  }

  private async loadL2(): Promise<void> {
    try {
      const keys = await this.l2.list(L2_PREFIX);
      for (const key of keys) {
        if (this.l1.has(key)) continue;
        const entry = await this.l2.get<CacheEntry>(key);
        if (entry && !this.isExpired(entry)) {
          this.l1.set(key, entry);
          this.touchL1(key);
        }
      }
      this.evictL1();
      this.l2Loaded = true;
    } catch {
      // L2 unavailable — operate in L1-only mode
      this.l2Loaded = true;
    }
  }

  private touchL1(key: string): void {
    const idx = this.accessOrder.indexOf(key);
    if (idx >= 0) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
  }

  private evictL1(): void {
    while (this.l1.size > this.config.maxEntries && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.l1.delete(oldest);
    }
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs;
  }

  private async safeEmbed(messages: Message[]): Promise<number[] | null> {
    try {
      // Embed the full conversation as a single string for caching
      const text = messages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
      const vectors = await this.embeddingProvider.embed([text]);
      return vectors[0] ?? null;
    } catch {
      return null;
    }
  }
}

// --- Pure helpers ---

export function hashRequest(
  model: string,
  messages: Message[],
  tools: ToolDefinition[] | undefined,
  budget: { maxTokens?: number; numCtx?: number },
): string {
  const payload = JSON.stringify({ model, messages, tools, ...budget });
  return simpleHash(payload);
}

function simpleHash(str: string): string {
  // FNV-1a — fast, non-crypto, good distribution
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  let h2 = 0x811c9dc5;
  for (let i = str.length - 1; i >= 0; i--) {
    h2 ^= str.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
