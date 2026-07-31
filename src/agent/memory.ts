import type { AgentConfig, Message, ToolCall, ToolDefinition } from '../core/types.ts';
import type { Workspace } from '../ports/workspace.ts';
import { TOOL_PROTOCOL_BLOCK, WORKSPACE_INSTRUCTION_FILES } from '../core/constants.ts';
import { buildCompactToolCatalog } from '../tools/compact-catalog.ts';
import { buildAgeSummary, truncateContent } from './summarizer.ts';

export class WorkingMemory {
  private messages: Message[] = [];

  constructor(private config: AgentConfig) {}

  async loadInstructionFiles(
    workspace: Workspace,
    toolDefinitions: ToolDefinition[] = [],
  ): Promise<void> {
    const parts: string[] = [
      'You are Aur, an autonomous coding agent.',
      `Working directory: ${this.config.workingDir}`,
      this.buildPermissionNotice(),
    ];

    for (const filename of WORKSPACE_INSTRUCTION_FILES) {
      try {
        if (await workspace.exists(filename)) {
          const content = await workspace.read(filename);
          parts.push(`\n## Instruções de ${filename}\n${content}`);
        }
      } catch {
        // skip
      }
    }

    if (this.config.rulesPaths) {
      for (const filepath of this.config.rulesPaths) {
        try {
          if (await workspace.exists(filepath)) {
            const content = await workspace.read(filepath);
            parts.push(`\n## Instruções de ${filepath}\n${content}`);
          }
        } catch {
          // skip
        }
      }
    }

    parts.push(TOOL_PROTOCOL_BLOCK);
    parts.push(
      buildCompactToolCatalog(toolDefinitions, this.config.compactCatalogMaxTokens),
    );

    this.addSystem(parts.join('\n\n'));
  }

  addSystem(content: string): void {
    this.messages.push({ role: 'system', content });
  }

  addUser(content: string): void {
    this.messages.push({ role: 'user', content });
  }

  addAssistant(content: string, toolCalls?: ToolCall[]): void {
    const msg: Message = { role: 'assistant', content };
    if (toolCalls && toolCalls.length > 0) {
      msg.toolCalls = toolCalls;
    }
    this.messages.push(msg);
  }

  addToolResult(
    callId: string,
    content: string,
    toolName?: string,
  ): void {
    const threshold = this.config.summaryTokenThreshold;
    const finalContent = threshold && threshold > 0 ? truncateContent(content, threshold) : content;

    this.messages.push({
      role: 'tool',
      content: finalContent,
      toolCallId: callId,
      name: toolName,
    });
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  summarizeByAge(maxTurns: number = 20): void {
    const maxMessages = maxTurns * 2;
    if (this.messages.length <= maxMessages) return;

    const systemMsg = this.messages[0]?.role === 'system' ? this.messages[0] : null;
    const keep = this.messages.slice(-maxMessages);
    const oldMessages = systemMsg
      ? this.messages.slice(1, -maxMessages)
      : this.messages.slice(0, -maxMessages);

    if (oldMessages.length === 0) return;

    const summary = buildAgeSummary(oldMessages);
    const summaryMsg: Message = { role: 'system', content: summary };

    this.messages = systemMsg ? [systemMsg, summaryMsg, ...keep] : [summaryMsg, ...keep];
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  private buildPermissionNotice(): string {
    switch (this.config.permissions) {
      case 'readonly':
        return 'Modo APENAS LEITURA. Nenhuma modificação em disco é permitida. Apenas análise e leitura.';
      case 'approve-all':
        return 'Aprovação automática ativada. Comandos executados sem confirmação.';
      default:
        return 'Ações de alto risco requerem aprovação humana.';
    }
  }
}
