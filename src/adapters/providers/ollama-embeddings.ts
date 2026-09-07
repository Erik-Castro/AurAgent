import type { EmbeddingProvider } from '../../ports/embedding-provider.ts';

const DEFAULT_MODEL = 'nomic-embed-text';
const DEFAULT_DIMENSIONS = 384;

export class OllamaEmbeddings implements EmbeddingProvider {
  readonly modelName: string;
  readonly dimensions: number;

  constructor(
    private baseUrl: string,
    modelName?: string,
    dimensions?: number,
  ) {
    this.modelName = modelName ?? DEFAULT_MODEL;
    this.dimensions = dimensions ?? DEFAULT_DIMENSIONS;
  }

  async embed(input: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        prompt: input,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      await response.body?.cancel();
      throw new Error(`Ollama embedding failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.embedding) {
      throw new Error('Ollama embedding response missing embedding field');
    }
    return [data.embedding];
  }
}
