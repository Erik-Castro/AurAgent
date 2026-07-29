export class ContentBuffer {
  private lines: string[] = [];
  private viewportOffset = 0;
  private maxLines: number;

  constructor(maxLines = 2000) {
    this.maxLines = maxLines;
  }

  push(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      const excess = this.lines.length - this.maxLines;
      this.lines.splice(0, excess);
      this.viewportOffset = Math.max(0, this.viewportOffset - excess);
    }
    this.scrollToBottom();
  }

  pushRaw(lines: string[]): void {
    for (const l of lines) {
      const parts = l.split('\n');
      for (const p of parts) this.push(p);
    }
  }

  getLineCount(): number {
    return this.lines.length;
  }

  getLines(): readonly string[] {
    return this.lines;
  }

  getSlice(start: number, count: number): string[] {
    return this.lines.slice(start, start + count);
  }

  getViewportOffset(): number {
    return this.viewportOffset;
  }

  scrollUp(amount = 1): void {
    this.viewportOffset = Math.max(0, this.viewportOffset - amount);
  }

  scrollDown(amount = 1): void {
    this.viewportOffset = Math.min(
      Math.max(0, this.lines.length - 1),
      this.viewportOffset + amount,
    );
  }

  pageUp(pageSize: number): void {
    this.scrollUp(pageSize);
  }

  pageDown(pageSize: number): void {
    this.scrollDown(pageSize);
  }

  scrollToBottom(): void {
    this.viewportOffset = Math.max(0, this.lines.length - 1);
  }

  isAtBottom(): boolean {
    return this.viewportOffset >= this.lines.length - 1 ||
      this.lines.length === 0;
  }

  clear(): void {
    this.lines = [];
    this.viewportOffset = 0;
  }

  getViewportLines(
    viewportHeight: number,
  ): { lines: string[]; offset: number; total: number } {
    const total = this.lines.length;
    const offset = Math.max(
      0,
      Math.min(this.viewportOffset, Math.max(0, total - 1)),
    );
    const start = Math.max(0, total - viewportHeight);
    const actualStart = offset > start
      ? Math.max(0, total - viewportHeight)
      : Math.max(0, offset);

    const end = Math.min(total, actualStart + viewportHeight);
    const slice = this.lines.slice(actualStart, end);

    const padded: string[] = [];
    for (let i = 0; i < viewportHeight; i++) {
      if (i < slice.length) {
        padded.push(slice[i]);
      } else {
        padded.push('');
      }
    }

    return { lines: padded, offset: actualStart, total };
  }
}
