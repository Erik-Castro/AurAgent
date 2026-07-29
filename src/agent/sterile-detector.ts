import { SterileLoopError } from '../core/errors.ts';

export class SterileLoopDetector {
  private history: Array<{ toolName: string; argsHash: string }> = [];

  constructor(private threshold: number = 3) {}

  check(toolName: string, args: Record<string, unknown>): void {
    const argsHash = JSON.stringify(args);
    this.history.push({ toolName, argsHash });

    if (this.history.length >= this.threshold) {
      const recent = this.history.slice(-this.threshold);
      const allSame = recent.every(
        (h) => h.toolName === toolName && h.argsHash === argsHash,
      );
      if (allSame) {
        throw new SterileLoopError(
          `Loop estéril detectado: ferramenta "${toolName}" executada ${this.threshold}x com os mesmos argumentos`,
          toolName,
          this.threshold,
        );
      }
    }
  }

  reset(): void {
    this.history = [];
  }
}
