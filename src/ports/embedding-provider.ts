export interface EmbeddingProvider {
  /** Compute embeddings for the given input strings. */
  embed(input: string[]): Promise<number[][]>;
  /** Dimensionality of the embedding vectors. */
  readonly dimensions: number;
  /** Name of the embedding model used. */
  readonly modelName: string;
}
