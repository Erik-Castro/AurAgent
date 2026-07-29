import type { MemoryStore } from '../ports/memory-store.ts';

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

  async list(prefix?: string): Promise<string[]> {
    const kv = await this.ensure();
    const entries = kv.list<string>({ prefix: prefix ? [prefix] : [] });
    const keys: string[] = [];
    for await (const entry of entries) {
      keys.push(entry.key[0] as string);
    }
    return keys;
  }

  close(): void {
    if (this.kv) {
      this.kv.close();
      this.kv = null;
    }
  }

  private async ensure(): Promise<Deno.Kv> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.dbPath);
    }
    return this.kv;
  }
}
