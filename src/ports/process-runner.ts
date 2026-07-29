import type { ProcessRequest, ProcessResult } from '../core/types.ts';

export interface ProcessRunner {
  run(request: ProcessRequest): Promise<ProcessResult>;
}
