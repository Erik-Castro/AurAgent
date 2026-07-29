import type { Workspace, WorkspaceEntry } from '../ports/workspace.ts';

export class DenoWorkspace implements Workspace {
  constructor(private basePath: string = Deno.cwd()) {}

  async read(path: string): Promise<string> {
    return await Deno.readTextFile(this.resolve(path));
  }

  async write(path: string, content: string): Promise<void> {
    const fullPath = this.resolve(path);
    await Deno.mkdir(this.dirname(fullPath), { recursive: true });
    await Deno.writeTextFile(fullPath, content);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Deno.stat(this.resolve(path));
      return true;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) return false;
      throw err;
    }
  }

  async remove(path: string): Promise<void> {
    await Deno.remove(this.resolve(path), { recursive: true });
  }

  async list(pattern?: string): Promise<string[]> {
    const files: string[] = [];
    for await (const entry of this.walk(this.basePath)) {
      if (!pattern || this.matchGlob(entry, pattern)) {
        files.push(entry);
      }
    }
    return files;
  }

  async readMultiple(paths: string[]): Promise<WorkspaceEntry[]> {
    return await Promise.all(
      paths.map(async (path) => {
        const content = await this.read(path);
        const ext = path.split('.').pop() ?? '';
        return { path, content, language: ext, size: content.length };
      }),
    );
  }

  private resolve(path: string): string {
    if (path.startsWith('/')) return path;
    return `${this.basePath}/${path}`;
  }

  private dirname(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(0, idx) : '.';
  }

  private async *walk(dir: string): AsyncGenerator<string> {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        yield* this.walk(fullPath);
      } else {
        yield fullPath;
      }
    }
  }

  private matchGlob(filePath: string, pattern: string): boolean {
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '___GLOBSTAR___')
      .replace(/\*/g, '[^/]*')
      .replace(/___GLOBSTAR___/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexStr}$`).test(filePath);
  }
}
