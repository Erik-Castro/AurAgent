import type { EmbeddingProvider } from '../../ports/embedding-provider.ts';

/**
 * Fallback embedding provider that returns empty vectors.
 * Used when no real embedding provider is configured — cache falls back to exact-match only.
 */
export class NoopEmbeddings implements EmbeddingProvider {
  readonly modelName = 'noop';
  readonly dimensions = 0;

  embed(_input: string[]): Promise<number[][]> {
    return Promise.resolve(_input.map(() => []));
  }
}
