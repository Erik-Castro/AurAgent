import type { AgentContext } from './agent-context.ts';
import { ReadOnlyGuard } from './read-only-guard.ts';
import { HITLManager } from './hitl-manager.ts';
import { CheckpointManager } from './checkpoint.ts';
import { buildSessionSummary } from './summarizer.ts';
import { WorkingMemory } from './memory.ts';
import { runReActLoop } from './loop.ts';

export interface AgentResult {
  status: 'success' | 'error' | 'max_iterations' | 'truncated';
  output: string;
  iterations: number;
  durationMs: number;
}

export class Agent {
  constructor(private ctx: AgentContext) {
    this.applySecurity();
  }

  async run(task: string): Promise<AgentResult> {
    this.ctx.eventBus.emit('task:started', { task });

    const memory = new WorkingMemory(this.ctx.config);
    await memory.loadInstructionFiles(this.ctx.workspace);
    memory.addUser(task);

    try {
      const result = await runReActLoop(task, this.ctx, memory, this.ctx.config.display);

      await this.ctx.checkpointManager?.cleanup();
      await this.persistSessionSummary(task, result, memory);

      return result;
    } catch (err) {
      await this.ctx.checkpointManager?.cleanup();

      const msg = (err as Error).message;
      this.ctx.eventBus.emit('task:cancelled', { error: msg });
      return {
        status: 'error',
        output: msg,
        iterations: 0,
        durationMs: 0,
      };
    }
  }

  private applySecurity(): void {
    const patches: Partial<AgentContext> = {};

    if (this.ctx.config.permissions === 'readonly') {
      patches.workspace = new ReadOnlyGuard(this.ctx.workspace);
    }

    if (
      !this.ctx.hitlManager &&
      this.ctx.config.permissions !== 'approve-all'
    ) {
      patches.hitlManager = new HITLManager();
    }

    if (!this.ctx.checkpointManager) {
      patches.checkpointManager = new CheckpointManager(
        this.ctx.config.workingDir,
      );
    }

    this.ctx = { ...this.ctx, ...patches };
  }

  private async persistSessionSummary(
    task: string,
    result: AgentResult,
    memory: WorkingMemory,
  ): Promise<void> {
    try {
      const summary = buildSessionSummary(
        task,
        result,
        memory.getMessageCount(),
      );
      const projectKey = this.ctx.config.workingDir.replace(/[\/\\]/g, '_');
      const key = `session:${projectKey}:${Date.now()}`;
      await this.ctx.memoryStore.set(key, summary);
    } catch {
      // non-critical, ignore
    }
  }
}
