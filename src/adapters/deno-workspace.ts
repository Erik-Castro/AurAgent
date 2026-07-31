import type { Workspace, WorkspaceEntry } from '../ports/workspace.ts';
import { WorkspacePathError } from '../core/errors.ts';

function normalizeSegments(abs: string): string {
  const parts = abs.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (result.length === 0) {
        throw new WorkspacePathError(`Path fora do workspace: ${abs}`);
      }
      result.pop();
      continue;
    }
    result.push(part);
  }
  return '/' + result.join('/');
}

function isPathInsideWorkspace(root: string, resolved: string): boolean {
  const normalizedRoot = normalizeSegments(root);
  if (resolved === normalizedRoot) return false;
  return resolved.startsWith(normalizedRoot + '/');
}

export class DenoWorkspace implements Workspace {
  constructor(private basePath: string = Deno.cwd()) {}

  async read(path: string): Promise<string> {
    return await Deno.readTextFile(this.resolve(path));
  }

  async write(path: string, content: string): Promise<void> {
    if (typeof content !== 'string') {
      throw new TypeError('content deve ser uma string');
    }
    const fullPath = this.resolve(path);
    try {
      const info = await Deno.stat(fullPath);
      if (info.isDirectory) {
        throw new WorkspacePathError(`Path é um diretório: ${path}`);
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound) && err instanceof WorkspacePathError) {
        throw err;
      }
    }
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
    if (typeof path !== 'string' || path.trim() === '') {
      throw new WorkspacePathError('Path vazio ou inválido');
    }
    if (path.includes('\0')) {
      throw new WorkspacePathError('Path contém caractere NUL');
    }
    const candidate = path.startsWith('/') ? path : `${this.basePath}/${path}`;
    const normalized = normalizeSegments(candidate);
    if (!isPathInsideWorkspace(this.basePath, normalized)) {
      throw new WorkspacePathError(`Path fora do workspace: ${path}`);
    }
    return normalized;
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
