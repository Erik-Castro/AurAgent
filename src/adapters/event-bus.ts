import type { EventBus, EventName, EventHandler, Event } from '../ports/event-bus.ts';

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<EventName, Set<EventHandler>>();

  emit(name: EventName, data?: Record<string, unknown>): void {
    const event: Event = { name, timestamp: Date.now(), data: data ?? {} };
    const handlers = this.handlers.get(name);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result instanceof Promise) {
            result.catch(console.error);
          }
        } catch (err) {
          console.error(`EventBus error on ${name}:`, err);
        }
      }
    }
  }

  on(name: EventName, handler: EventHandler): () => void {
    if (!this.handlers.has(name)) {
      this.handlers.set(name, new Set());
    }
    this.handlers.get(name)!.add(handler);
    return () => this.off(name, handler);
  }

  off(name: EventName, handler: EventHandler): void {
    this.handlers.get(name)?.delete(handler);
  }

  once(name: EventName, handler: EventHandler): void {
    const wrapper: EventHandler = (event) => {
      this.off(name, wrapper);
      return handler(event);
    };
    this.on(name, wrapper);
  }
}
