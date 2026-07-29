export type TuiKey =
  | 'up'
  | 'down'
  | 'page_up'
  | 'page_down'
  | 'ctrl_c'
  | 'q'
  | 'a'
  | 'r'
  | 'e'
  | 'unknown';

export type KeyListener = (key: TuiKey) => void;

export class InputHandler {
  private listeners: Set<KeyListener> = new Set();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private running = false;

  private readonly RAW_ARROW_UP = '[A';
  private readonly RAW_ARROW_DOWN = '[B';
  private readonly RAW_PAGE_UP = '[5~';
  private readonly RAW_PAGE_DOWN = '[6~';

  onKey(listener: KeyListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    Deno.stdin.setRaw(true);
    this.reader = Deno.stdin.readable.getReader();

    void this.readLoop();
  }

  stop(): void {
    this.running = false;
    try {
      Deno.stdin.setRaw(false);
    } catch {
      // may already be reset
    }
    this.reader?.cancel().catch(() => {});
    this.reader = null;
  }

  private async readLoop(): Promise<void> {
    let buf = '';

    while (this.running && this.reader) {
      const { done, value } = await this.reader.read();
      if (done || !value) break;

      buf += new TextDecoder().decode(value);

      while (buf.length > 0) {
        const consumed = this.processInput(buf);
        if (consumed === 0) break;
        buf = buf.slice(consumed);
      }
    }
  }

  private processInput(buf: string): number {
    if (buf[0] === '\x03') {
      this.emit('ctrl_c');
      return 1;
    }

    if (buf[0] === '\x1b' && buf.length >= 3) {
      const seq = buf.slice(1, 3);
      if (seq === this.RAW_ARROW_UP) { this.emit('up'); return 3; }
      if (seq === this.RAW_ARROW_DOWN) { this.emit('down'); return 3; }
    }

    if (buf[0] === '\x1b' && buf.length >= 4) {
      const seq = buf.slice(1, 4);
      if (seq === this.RAW_PAGE_UP) { this.emit('page_up'); return 4; }
      if (seq === this.RAW_PAGE_DOWN) { this.emit('page_down'); return 4; }
    }

    if (buf[0] === 'q' || buf[0] === 'Q') { this.emit('q'); return 1; }
    if (buf[0] === 'a' || buf[0] === 'A') { this.emit('a'); return 1; }
    if (buf[0] === 'r' || buf[0] === 'R') { this.emit('r'); return 1; }
    if (buf[0] === 'e' || buf[0] === 'E') { this.emit('e'); return 1; }

    if (buf[0] === '\x1b') {
      // incomplete escape sequence, wait for more bytes
      return buf.length >= 4 ? 4 : 0;
    }

    return 1;
  }

  private emit(key: TuiKey): void {
    for (const fn of this.listeners) fn(key);
  }
}
