import type { Workspace } from '../ports/workspace.ts';
import type { EventBus } from '../ports/event-bus.ts';

export interface CheckpointEntry {
  id: string;
  filePath: string;
  /** Conteúdo UTF-8 antes da escrita. String vazia se existed === false. */
  originalContent: string;
  /** true se e somente se workspace.exists(filePath) era true antes da escrita. */
  existed: boolean;
  timestamp: number;
  iteration: number;
}

export class CheckpointManager {
  private checkpoints: CheckpointEntry[] = [];
  private baseDir: string;

  constructor(
    workspaceRoot: string,
    private eventBus?: EventBus,
  ) {
    this.baseDir = `${workspaceRoot}/.aur/checkpoints`;
  }

  async saveBeforeWrite(
    filePath: string,
    iteration: number,
    workspace: Workspace,
  ): Promise<string> {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new Error('filePath deve ser uma string não vazia');
    }

    const safePath = filePath.replace(/[\/\\]/g, '_');
    const id = `iter-${iteration}_${safePath}`;

    const existed = await workspace.exists(filePath);
    const originalContent = existed ? await workspace.read(filePath) : '';

    const entry: CheckpointEntry = {
      id,
      filePath,
      originalContent,
      existed,
      timestamp: Date.now(),
      iteration,
    };

    this.checkpoints.push(entry);
    await this.persistEntry(entry);
    this.eventBus?.emit('checkpoint:created', { id, filePath, iteration });
    return id;
  }

  async restore(
    id: string,
    workspace: Workspace,
  ): Promise<void> {
    const entry = this.checkpoints.find((c) => c.id === id);
    if (!entry) {
      throw new Error(`Checkpoint ${id} não encontrado`);
    }
    await this.restoreEntry(entry, workspace);
    this.eventBus?.emit('checkpoint:restored', { id: entry.id, filePath: entry.filePath });
  }

  async restoreLast(workspace: Workspace): Promise<void> {
    const last = this.checkpoints[this.checkpoints.length - 1];
    if (!last) return;
    await this.restoreEntry(last, workspace);
    this.eventBus?.emit('checkpoint:restored', {
      id: last.id,
      filePath: last.filePath,
    });
  }

  private async restoreEntry(
    entry: CheckpointEntry,
    workspace: Workspace,
  ): Promise<void> {
    if (entry.existed) {
      await workspace.write(entry.filePath, entry.originalContent);
    } else {
      const stillExists = await workspace.exists(entry.filePath);
      if (stillExists) {
        await workspace.remove(entry.filePath);
      }
    }
  }

  async cleanup(): Promise<void> {
    try {
      await Deno.remove(this.baseDir, { recursive: true });
    } catch {
      // directory may not exist
    }
  }

  private async persistEntry(entry: CheckpointEntry): Promise<void> {
    await Deno.mkdir(this.baseDir, { recursive: true });
    await Deno.writeTextFile(
      `${this.baseDir}/${entry.id}.json`,
      JSON.stringify(entry, null, 2),
    );
  }
}
