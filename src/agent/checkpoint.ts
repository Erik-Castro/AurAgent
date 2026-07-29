import type { Workspace } from '../ports/workspace.ts';

export interface CheckpointEntry {
  id: string;
  filePath: string;
  originalContent: string;
  timestamp: number;
  iteration: number;
}

export class CheckpointManager {
  private checkpoints: CheckpointEntry[] = [];
  private baseDir: string;

  constructor(workspaceRoot: string) {
    this.baseDir = `${workspaceRoot}/.aur/checkpoints`;
  }

  async saveBeforeWrite(
    filePath: string,
    iteration: number,
    workspace: Workspace,
  ): Promise<string> {
    const safePath = filePath.replace(/[\/\\]/g, '_');
    const id = `iter-${iteration}_${safePath}`;

    let originalContent = '';
    try {
      if (await workspace.exists(filePath)) {
        originalContent = await workspace.read(filePath);
      }
    } catch {
      // new file, no original content
    }

    const entry: CheckpointEntry = {
      id,
      filePath,
      originalContent,
      timestamp: Date.now(),
      iteration,
    };

    this.checkpoints.push(entry);
    await this.persistEntry(entry);
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
    await workspace.write(entry.filePath, entry.originalContent);
  }

  async restoreLast(workspace: Workspace): Promise<void> {
    const last = this.checkpoints[this.checkpoints.length - 1];
    if (!last) return;
    await workspace.write(last.filePath, last.originalContent);
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
