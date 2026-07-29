import type { StreamDisplay, ToolCall, GenerateResponse } from '../core/types.ts';
import type { ContentBuffer } from './content-buffer.ts';
import {
  BOLD,
  CYAN,
  DIM,
  GREEN,
  RED,
  RESET,
  YELLOW,
  ITEM_ICON,
  TOOL_ICON,
  OK_ICON,
} from './renderer.ts';

export class StreamDisplayImpl implements StreamDisplay {
  private content = '';
  private toolCalls: ToolCall[] = [];
  private finishReason: GenerateResponse['finishReason'] = 'stop';

  constructor(private buffer: ContentBuffer) {}

  startIteration(n: number): void {
    this.content = '';
    this.toolCalls = [];
    this.finishReason = 'stop';
    this.buffer.push('');
    this.buffer.push(
      `${BOLD}${CYAN}${ITEM_ICON} Iteração ${n}${RESET}`,
    );
    this.buffer.push(`${DIM}  ── pensamento ──${RESET}`);
  }

  onToken(text: string): void {
    this.content += text;
  }

  flush(): void {
    if (!this.content) return;
    const lines = this.content.split('\n');
    for (const line of lines) {
      this.buffer.push(`  ${line}`);
    }
    this.content = '';
  }

  onToolCall(call: ToolCall): void {
    this.flush();
    this.toolCalls.push(call);
    const args = JSON.stringify(call.args);
    this.buffer.push('');
    this.buffer.push(`${BOLD}${YELLOW}${TOOL_ICON} ${call.name}(${args})${RESET}`);
  }

  onDone(finishReason: GenerateResponse['finishReason']): void {
    this.flush();
    this.finishReason = finishReason;
    const icon = finishReason === 'stop' ? OK_ICON : '⬡';
    const color = finishReason === 'stop' ? GREEN : YELLOW;
    this.buffer.push(
      ` ${color}${icon} finalizado (${finishReason})${RESET}`,
    );
  }

  onError(message: string): void {
    this.flush();
    this.finishReason = 'error';
    this.buffer.push(` ${RED}${ITEM_ICON} [ERRO] ${message}${RESET}`);
  }
}
