import type { ToolCall, GenerateResponse } from '../core/types.ts';

const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

export class Explainer {
  private content = '';
  private toolCalls: ToolCall[] = [];
  private finishReason: GenerateResponse['finishReason'] = 'stop';

  constructor(private enabled: boolean) {}

  startIteration(n: number): void {
    if (!this.enabled) return;
    console.log(`\n${BOLD}${CYAN}■ Iteração ${n}${RESET}`);
    console.log(`${BOLD}${CYAN}  ── pensamento ──${RESET}`);
  }

  onToken(text: string): void {
    if (!this.enabled) return;
    this.content += text;
    Deno.stdout.writeSync(new TextEncoder().encode(text));
  }

  onToolCall(call: ToolCall): void {
    if (!this.enabled) return;
    this.toolCalls.push(call);
    const args = JSON.stringify(call.args);
    console.log(
      `\n${BOLD}${YELLOW}▶ ${call.name}(${args})${RESET}`,
    );
  }

  onDone(finishReason: GenerateResponse['finishReason']): void {
    if (!this.enabled) return;
    this.finishReason = finishReason;
    console.log(
      `\n${BOLD}${GREEN}  ── finalizado (${finishReason}) ──${RESET}\n`,
    );
  }

  onError(message: string): void {
    if (!this.enabled) return;
    this.finishReason = 'error';
    console.error(`\n${BOLD}${RED}[ERRO] ${message}${RESET}\n`);
  }

  getResult(): GenerateResponse {
    return {
      content: this.content,
      toolCalls: this.toolCalls.length > 0 ? this.toolCalls : undefined,
      finishReason: this.finishReason,
    };
  }
}
