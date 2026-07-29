import type { MemoryStore } from '../ports/memory-store.ts';

const DEFAULT_LIST_LIMIT = 1_000;

export class DenoKVStore implements MemoryStore {
  private kv: Deno.Kv | null = null;

  constructor(private dbPath?: string) {}

  async get<T>(key: string): Promise<T | null> {
    const kv = await this.ensure();
    const result = await kv.get<T>([key]);
    return result.value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const kv = await this.ensure();
    await kv.set([key], value);
  }

  async delete(key: string): Promise<void> {
    const kv = await this.ensure();
    await kv.delete([key]);
  }

  async list(prefix?: string, limit: number = DEFAULT_LIST_LIMIT): Promise<string[]> {
    const kv = await this.ensure();
    const entries = prefix
      ? kv.list<string>({ prefix: [prefix] })
      : kv.list<string>({ prefix: [] as string[] });
    const keys: string[] = [];
    for await (const entry of entries) {
      // Reconstitui a chave completa juntando todos os segmentos
      keys.push(entry.key.join(':'));
      if (keys.length >= limit) break;
    }
    return keys;
  }

  close(): void {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
    }
  }

  isOpen(): boolean {
    return this.kv !== null;
  }

  private async ensure(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.dbPath);
    }
    return this.kv;
  }
}
