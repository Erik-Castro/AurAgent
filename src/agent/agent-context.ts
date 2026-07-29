import type { Workspace } from '../ports/workspace.ts';
import type { ProcessRunner } from '../ports/process-runner.ts';
import type { ModelProvider } from '../ports/model-provider.ts';
import type { EventBus } from '../ports/event-bus.ts';
import type { MemoryStore } from '../ports/memory-store.ts';
import type { ToolHandler } from '../tools/handler.ts';
import type { AgentConfig } from '../core/types.ts';
import type { HITLManager } from './hitl-manager.ts';
import type { CheckpointManager } from './checkpoint.ts';

export interface AgentContext {
  workspace: Workspace;
  processRunner: ProcessRunner;
  modelProvider: ModelProvider;
  eventBus: EventBus;
  memoryStore: MemoryStore;
  toolHandlers: Map<string, ToolHandler>;
  config: AgentConfig;
  hitlManager?: HITLManager;
  checkpointManager?: CheckpointManager;
}
