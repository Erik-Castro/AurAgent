import type { EventBus } from '../ports/event-bus.ts';
import { ContentBuffer } from './content-buffer.ts';
import { InputHandler, type TuiKey } from './input.ts';
import { StreamDisplayImpl } from './stream-display.ts';
import { createEventAdapter, type StatusState } from './event-adapter.ts';
import { getLayout } from './layout.ts';
import {
  cursorTo,
  eraseLine,
  hideCursor,
  showCursor,
  renderHeaderBar,
  renderStatusBar,
  write,
  truncateLine,
  DIM,
  RESET,
} from './renderer.ts';
import type { StreamDisplay } from '../core/types.ts';

export interface TuiOptions {
  task: string;
  model: string;
  maxIterations: number;
}

export class TuiEngine {
  private buffer = new ContentBuffer(2000);
  private input = new InputHandler();
  private streamDisplay: StreamDisplayImpl;
  private layout = getLayout();
  private running = false;
  private renderTimer: ReturnType<typeof setInterval> | null = null;
  private status: StatusState;
  private eventCleanup: (() => void) | null = null;
  private resizeHandler: (() => void) | null = null;

  readonly stream: StreamDisplay;

  constructor(private opts: TuiOptions) {
    this.streamDisplay = new StreamDisplayImpl(this.buffer);
    this.stream = this.streamDisplay;
    this.status = {
      iteration: 0,
      maxIterations: opts.maxIterations,
      currentTool: '',
      elapsed: '00:00',
      statusText: 'aguardando',
      task: opts.task,
      model: opts.model,
    };
  }

  start(bus: EventBus): void {
    this.running = true;
    this.layout = getLayout();

    write(hideCursor());

    this.eventCleanup = createEventAdapter(bus, this.buffer, this.status);
    this.input.start();
    this.input.onKey(this.handleKey);

    this.resizeHandler = () => {
      this.layout = getLayout();
      this.renderLoop();
    };
    Deno.addSignalListener('SIGWINCH', this.resizeHandler);

    this.renderLoop();
    this.startRenderTimer();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.renderTimer !== null) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }

    this.input.stop();
    this.eventCleanup?.();

    if (this.resizeHandler) {
      try {
        Deno.removeSignalListener('SIGWINCH', this.resizeHandler);
      } catch {
        // may not be registered
      }
      this.resizeHandler = null;
    }

    write(showCursor());
    write(cursorTo(this.layout.rows, 1));
    write('\n');
  }

  private handleKey = (key: TuiKey): void => {
    switch (key) {
      case 'ctrl_c':
        this.stop();
        Deno.exit(0);
        break;
      case 'up':
        this.buffer.scrollUp();
        this.renderContent();
        break;
      case 'down':
        this.buffer.scrollDown();
        this.renderContent();
        break;
      case 'page_up':
        this.buffer.pageUp(this.layout.contentHeight);
        this.renderContent();
        break;
      case 'page_down':
        this.buffer.pageDown(this.layout.contentHeight);
        this.renderContent();
        break;
      case 'q':
        this.stop();
        Deno.exit(0);
        break;
    }
  };

  private startRenderTimer(): void {
    const fps = 30;
    this.renderTimer = setInterval(() => {
      this.streamDisplay.flush();
      this.renderLoop();
    }, 1000 / fps);
  }

  private renderLoop(): void {
    this.updateElapsed();
    this.renderHeader();
    this.renderContent();
    this.renderStatus();
  }

  private renderHeader(): void {
    const { cols } = this.layout;
    write(renderHeaderBar(cols, this.status.task, this.status.model));
    write(eraseLine());
  }

  private renderContent(): void {
    const { contentStart, contentHeight, cols } = this.layout;

    const { lines, offset, total } = this.buffer.getViewportLines(contentHeight);

    for (let i = 0; i < contentHeight; i++) {
      const row = contentStart + i;
      write(cursorTo(row, 1));
      write(eraseLine());
      if (i < lines.length && lines[i]) {
        write(truncateLine(lines[i], cols));
      }
    }

    const scrollInfo = total > contentHeight
      ? `${DIM}── linhas ${offset + 1}–${Math.min(total, offset + contentHeight)} de ${total}${RESET}`
      : '';
    if (scrollInfo && contentHeight > 0) {
      write(
        cursorTo(contentStart + contentHeight - 1, cols - 20),
      );
      write(scrollInfo);
    }
  }

  private renderStatus(): void {
    const { statusStart, cols } = this.layout;
    write(cursorTo(statusStart, 1));
    write(eraseLine());
    write(
      renderStatusBar(
        cols,
        this.status.iteration,
        this.status.maxIterations,
        this.status.currentTool,
        this.status.elapsed,
        this.status.statusText,
      ),
    );
  }

  private updateElapsed(): void {
    const now = performance.now();
    const secs = Math.floor(now / 1000);
    const mins = Math.floor(secs / 60);
    const hrs = Math.floor(mins / 60);
    this.status.elapsed =
      `${String(hrs).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }
}
