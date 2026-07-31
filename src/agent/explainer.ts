import type { GenerateResponse, ToolCall } from '../core/types.ts';
import type { AgentState } from './state.ts';

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

  onState(state: AgentState): void {
    if (!this.enabled) return;
    console.log(`${BOLD}${CYAN}  ── state ──${RESET}`);
    console.log(`  objective: ${state.objective.slice(0, 120)}`);
    console.log(
      `  plan: ${state.plan.map((s) => `${s.id}:${s.status}`).join(', ')}`,
    );
    console.log(`  lastAction: ${state.lastAction?.tool ?? 'none'}`);
    console.log(`  openErrors: ${state.openErrors.length}`);
  }

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

  onPseudoToolCall(call: ToolCall): void {
    if (!this.enabled) return;
    console.log(`${BOLD}${YELLOW}  ── pseudo-tool ──${RESET}`);
    this.onToolCall(call);
  }

  onToolResult(toolName: string, output: string, maxChars = 100_000): void {
    if (!this.enabled) return;
    const truncated = output.length > maxChars
      ? output.slice(0, maxChars) + '\n… [truncated]'
      : output;
    console.log(
      `\n${BOLD}${CYAN}  ── observation (${toolName}) ──${RESET}`,
    );
    console.log(truncated);
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
