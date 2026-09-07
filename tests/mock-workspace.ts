import type { FileStat, Workspace, WorkspaceEntry } from '../src/ports/workspace.ts';

export class MemoryWorkspace implements Workspace {
  files = new Map<string, string>();

  read(path: string): Promise<string> {
    return Promise.resolve(this.files.get(path) ?? '');
  }

  write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }

  exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(path));
  }

  remove(path: string): Promise<void> {
    this.files.delete(path);
    return Promise.resolve();
  }

  list(_pattern?: string): Promise<string[]> {
    return Promise.resolve([...this.files.keys()]);
  }

  readMultiple(paths: string[]): Promise<WorkspaceEntry[]> {
    return Promise.resolve(
      paths.map((path) => {
        const content = this.files.get(path) ?? '';
        return { path, content, language: '', size: content.length };
      }),
    );
  }

  stat(path: string): Promise<FileStat | null> {
    const content = this.files.get(path);
    if (content === undefined) return Promise.resolve(null);
    return Promise.resolve({ size: content.length, isFile: true });
  }

  async *readStream(path: string): AsyncIterable<string> {
    const content = this.files.get(path) ?? '';
    const lines = content.split('\n');
    for (const line of lines) {
      yield line;
    }
  }

  lineCount(path: string): Promise<number> {
    const content = this.files.get(path) ?? '';
    if (content === '') return Promise.resolve(0);
    return Promise.resolve(content.split('\n').length);
  }
}
