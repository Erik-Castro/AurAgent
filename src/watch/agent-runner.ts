import { DenoWorkspace } from '../adapters/deno-workspace.ts';
import { DenoProcessRunner } from '../adapters/deno-process-runner.ts';
import { InMemoryEventBus } from '../adapters/event-bus.ts';
import { DenoKVStore } from '../adapters/deno-kv-store.ts';
import { RestrictedCommands } from '../adapters/restricted-commands.ts';
import { createModelProvider } from '../adapters/providers/factory.ts';
import { buildToolRegistry } from '../tools/register.ts';
import { Agent } from '../agent/agent.ts';
import type { AgentConfig, PermissionLevel } from '../core/types.ts';
import type { AgentContext } from '../agent/agent-context.ts';

export interface RunnerOptions {
  config: AgentConfig;
  permissions: PermissionLevel;
  dryRun: boolean;
  explain: boolean;
  rulesPaths: string[];
  securityPatterns: RegExp[];
  modelOverride?: string;
}

export function buildAgentContext(opts: RunnerOptions): AgentContext {
  const effectiveModel = opts.modelOverride ?? opts.config.model;

  return {
    workspace: new DenoWorkspace(opts.config.workingDir),
    processRunner: new DenoProcessRunner(
      new RestrictedCommands(opts.securityPatterns),
    ),
    modelProvider: createModelProvider(effectiveModel),
    eventBus: new InMemoryEventBus(),
    memoryStore: new DenoKVStore(),
    toolHandlers: buildToolRegistry().handlers,
    config: {
      ...opts.config,
      model: effectiveModel,
      permissions: opts.permissions,
      dryRun: opts.dryRun,
      explain: opts.explain,
      rulesPaths: opts.rulesPaths,
    },
  };
}

export async function runAgent(
  task: string,
  opts: RunnerOptions,
): Promise<void> {
  const ctx = buildAgentContext(opts);
  const agent = new Agent(ctx);
  const result = await agent.run(task);

  console.log(`\n  Status: ${result.status}`);
  console.log(`  Iterações: ${result.iterations}`);
  console.log(`  Duração: ${result.durationMs}ms`);
}
