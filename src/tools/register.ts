import { ToolRegistry } from '../core/tool-registry.ts';
import type { ToolHandler } from './handler.ts';
import { ALL_HANDLERS } from './implementations.ts';

export function buildToolRegistry(): {
  registry: ToolRegistry;
  handlers: Map<string, ToolHandler>;
} {
  const registry = new ToolRegistry();
  const handlers = new Map<string, ToolHandler>();

  for (const handler of ALL_HANDLERS) {
    registry.register(handler.definition);
    handlers.set(handler.definition.name, handler);
  }

  return { registry, handlers };
}
