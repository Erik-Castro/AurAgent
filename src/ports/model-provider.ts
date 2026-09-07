import type {
  GenerateRequest,
  GenerateResponse,
  ModelEvent,
  StreamRequest,
} from '../core/types.ts';

export interface ModelProvider {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  stream(request: StreamRequest): ReadableStream<ModelEvent>;
  getContextWindow?(): Promise<number | null>;
}
