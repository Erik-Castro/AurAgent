import type { Workspace, WorkspaceEntry } from '../ports/workspace.ts';
import { PermissionError } from '../core/errors.ts';

export class ReadOnlyGuard implements Workspace {
  constructor(private inner: Workspace) {}

  async read(path: string): Promise<string> {
    return await this.inner.read(path);
  }

  write(path: string, _content: string): Promise<void> {
    return Promise.reject(
      new PermissionError(
        `Modo somente leitura: não é possível escrever em "${path}"`,
        `write ${path}`,
      ),
    );
  }

  async exists(path: string): Promise<boolean> {
    return await this.inner.exists(path);
  }

  remove(path: string): Promise<void> {
    return Promise.reject(
      new PermissionError(
        `Modo somente leitura: não é possível remover "${path}"`,
        `remove ${path}`,
      ),
    );
  }

  async list(pattern?: string): Promise<string[]> {
    return await this.inner.list(pattern);
  }

  async readMultiple(paths: string[]): Promise<WorkspaceEntry[]> {
    return await this.inner.readMultiple(paths);
  }
}
