import type { EmbeddingProvider } from '../../ports/embedding-provider.ts';

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_DIMENSIONS = 1536;

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly modelName: string;
  readonly dimensions: number;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    modelName?: string,
    dimensions?: number,
  ) {
    this.modelName = modelName ?? DEFAULT_MODEL;
    this.dimensions = dimensions ?? DEFAULT_DIMENSIONS;
  }

  async embed(input: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      await response.body?.cancel();
      throw new Error(`OpenAI embedding failed (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('OpenAI embedding response missing data array');
    }
    return data.data.map((item: { embedding: number[] }) => item.embedding);
  }
}
