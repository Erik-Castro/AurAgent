import type {
  GenerateRequest,
  GenerateResponse,
  StreamRequest,
  ModelEvent,
} from '../core/types.ts';

export interface ModelProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: StreamRequest): ReadableStream<ModelEvent>;
  embeddings?(input: string[]): Promise<number[][]>;
}
