import type { ToolCall, ToolResult, ToolDefinition, AgentConfig } from '../core/types.ts';
import type { Workspace } from '../ports/workspace.ts';
import type { ProcessRunner } from '../ports/process-runner.ts';
import type { EventBus } from '../ports/event-bus.ts';
import type { MemoryStore } from '../ports/memory-store.ts';

export interface ToolContext {
  workspace: Workspace;
  processRunner: ProcessRunner;
  eventBus: EventBus;
  memoryStore: MemoryStore;
  config: AgentConfig;
}

export interface ToolHandler {
  definition: ToolDefinition;
  riskLevel: 'low' | 'medium' | 'high';
  parallelSafe: boolean;
  execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult>;
}
