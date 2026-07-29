import { deferred } from './deferred.ts';

export interface WatchOptions {
  debounceMs?: number;
  throttleMs?: number;
  includeExtensions?: string[];
  excludeDirs?: string[];
}

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.mts', '.cts',
  '.js', '.jsx', '.json', '.jsonc', '.md',
];
const DEFAULT_EXCLUDE = ['node_modules', '.aur', '.git'];

export class FileWatcher {
  private debounceMs: number;
  private throttleMs: number;
  private includeExtensions: Set<string>;
  private excludeDirs: string[];
  private lastRun = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private onChange: () => void | Promise<void>;

  constructor(
    onChange: () => void | Promise<void>,
    options?: WatchOptions,
  ) {
    this.onChange = onChange;
    this.debounceMs = options?.debounceMs ?? 300;
    this.throttleMs = options?.throttleMs ?? 2_000;
    this.includeExtensions = new Set(
      options?.includeExtensions ?? DEFAULT_EXTENSIONS,
    );
    this.excludeDirs = options?.excludeDirs ?? DEFAULT_EXCLUDE;
  }

  private shouldIgnore(path: string): boolean {
    for (const dir of this.excludeDirs) {
      if (path.includes(`/${dir}/`) || path.startsWith(`${dir}/`)) {
        return true;
      }
    }
    const ext = path.slice(path.lastIndexOf('.'));
    return !this.includeExtensions.has(ext);
  }

  private trigger(): void {
    const now = Date.now();
    if (now - this.lastRun < this.throttleMs) return;

    if (this.timer !== null) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.lastRun = Date.now();
      this.timer = null;
      this.onChange();
    }, this.debounceMs);
  }

  start(watchDir: string): Promise<void> {
    const done = deferred<void>();

    const watcher = Deno.watchFs(watchDir, { recursive: true });

    (async () => {
      try {
        for await (const event of watcher) {
          if (this.stopped) break;
          const relevant = event.paths.some((p) => !this.shouldIgnore(p));
          if (!relevant) continue;
          const isWrite = event.kind === 'modify' || event.kind === 'create';
          if (!isWrite) continue;
          this.trigger();
        }
      } catch {
        // watcher closed
      }
    })();

    Deno.addSignalListener('SIGINT', () => {
      this.stop();
      watcher.close();
      done.resolve();
    });

    return done.promise;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
