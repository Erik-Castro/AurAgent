import type { AgentContext } from './agent-context.ts';
import { ReadOnlyGuard } from './read-only-guard.ts';
import { HITLManager } from './hitl-manager.ts';
import { CheckpointManager } from './checkpoint.ts';
import { buildSessionSummary } from './summarizer.ts';
import { WorkingMemory } from './memory.ts';
import { runReActLoop, runReActLoopWithState } from './loop.ts';
import { resolveNumCtx } from './token-budget.ts';
import { createInitialState } from './state-transitions.ts';
import { indexWorkspace } from './workspace-snapshot.ts';
import type { AgentState } from './state.ts';
import type { ToolDefinition } from '../core/types.ts';

export interface AgentResult {
  status: 'success' | 'error' | 'max_iterations' | 'truncated' | 'failed_validation';
  output: string;
  iterations: number;
  durationMs: number;
}

const PREVIOUS_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class Agent {
  constructor(private ctx: AgentContext) {
    this.applySecurity();
  }

  async run(task: string): Promise<AgentResult> {
    this.ctx.eventBus.emit('task:started', { task });

    await this.resolveNumCtx();

    if (this.ctx.config.useExecutionState) {
      return await this.runWithState(task);
    }

    console.warn('Execution state disabled');
    return await this.runWithLegacyMemory(task);
  }

  private async runWithState(task: string): Promise<AgentResult> {
    const projectKey = this.ctx.config.workingDir.replace(/[\/\\]/g, '_');

    const prefetchConstraint = await this.prefetchPreviousSession(projectKey);

    const workspaceIndex = await indexWorkspace(this.ctx.workspace, this.ctx.config);
    let state = createInitialState(task, this.ctx.config, workspaceIndex);

    if (prefetchConstraint) {
      state = { ...state, constraints: [...state.constraints, prefetchConstraint] };
    }

    this.ctx.eventBus.emit('state:initialized', {
      objective: state.objective,
      planLength: state.plan.length,
    });

    try {
      const result = await runReActLoopWithState(
        task,
        this.ctx,
        state,
        this.ctx.config.display,
      );

      await this.ctx.checkpointManager?.cleanup();
      await this.persistStateSummary(task, result, state, projectKey);

      return result;
    } catch (err) {
      await this.ctx.checkpointManager?.cleanup();

      const msg = (err as Error).message;
      this.ctx.eventBus.emit('task:cancelled', { error: msg });
      return {
        status: 'error',
        output: msg,
        iterations: state.iteration,
        durationMs: 0,
      };
    } finally {
      this.closeMemoryStore();
    }
  }

  private async runWithLegacyMemory(task: string): Promise<AgentResult> {
    const memory = new WorkingMemory(this.ctx.config);
    const definitions: ToolDefinition[] = [...this.ctx.toolHandlers.values()].map(
      (h) => h.definition,
    );
    await memory.loadInstructionFiles(this.ctx.workspace, definitions);
    this.ctx.eventBus.emit('memory:loaded', { messageCount: memory.getMessageCount() });
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
    } finally {
      this.closeMemoryStore();
    }
  }

  private closeMemoryStore(): void {
    // Close the KV store to prevent resource leaks
    const maybeClosable = this.ctx.memoryStore as unknown as { close?: () => void };
    if (typeof maybeClosable.close === 'function') {
      try {
        maybeClosable.close();
      } catch {
        // non-critical cleanup
      }
    }
  }

  private async prefetchPreviousSession(
    projectKey: string,
  ): Promise<string | null> {
    try {
      const keys = await this.ctx.memoryStore.list(`session:${projectKey}:`);
      if (!keys.length) return null;

      const recent = keys
        .map((key) => {
          const match = key.match(/:(\d+)$/);
          return { key, ts: match ? Number(match[1]) : 0 };
        })
        .sort((a, b) => b.ts - a.ts)[0];

      if (!recent || recent.ts === 0) return null;

      const summary = await this.ctx.memoryStore.get<{
        status?: string;
        artifacts?: string[];
        endedAt?: number;
      }>(recent.key);
      if (!summary) return null;

      const now = Date.now();
      const endedAt = typeof summary.endedAt === 'number' ? summary.endedAt : recent.ts;
      if (now - endedAt > PREVIOUS_SESSION_MAX_AGE_MS) return null;

      const artifacts = (summary.artifacts ?? []).slice(0, 5).join(', ');
      const note =
        `Previous session note: status=${summary.status ?? 'unknown'} artifacts=${artifacts || '(none)'}`;
      return note.slice(0, 200);
    } catch {
      return null;
    }
  }

  private async persistStateSummary(
    task: string,
    result: AgentResult,
    state: AgentState,
    projectKey: string,
  ): Promise<void> {
    try {
      const summary = {
        task,
        objective: state.objective,
        status: result.status,
        iterations: result.iterations,
        artifacts: state.artifacts.map((a) => a.path),
        lastTool: state.lastAction?.tool ?? null,
        endedAt: Date.now(),
        durationMs: result.durationMs,
      };
      const key = `session:${projectKey}:${Date.now()}`;
      await this.ctx.memoryStore.set(key, summary);
      this.ctx.eventBus.emit('memory:persisted', {
        key,
        task,
        status: result.status,
      });
    } catch {
      // non-critical, ignore
    }
  }

  private async resolveNumCtx(): Promise<void> {
    let ollamaShowCtx: number | null = null;
    if (this.ctx.modelProvider.getContextWindow) {
      try {
        ollamaShowCtx = await this.ctx.modelProvider.getContextWindow();
      } catch {
        ollamaShowCtx = null;
      }
    }
    const budget = resolveNumCtx(
      this.ctx.config,
      Deno.env.toObject(),
      ollamaShowCtx,
    );
    this.ctx.config = {
      ...this.ctx.config,
      numCtx: budget.numCtx,
      outputReserveTokens: budget.outputReserveTokens,
    };
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
        this.ctx.eventBus,
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
      this.ctx.eventBus.emit('memory:persisted', { key, task, status: result.status });
    } catch {
      // non-critical, ignore
    }
  }
}
