export type EventName =
  | 'task:started'
  | 'task:completed'
  | 'task:cancelled'
  | 'iteration:started'
  | 'iteration:finished'
  | 'tool:started'
  | 'tool:finished'
  | 'tool:failed'
  | 'tool:hitl_required'
  | 'model:request_started'
  | 'model:request_finished'
  | 'checkpoint:created'
  | 'checkpoint:restored'
  | 'memory:loaded'
  | 'memory:persisted'
  | 'context:summarized';

export interface Event {
  name: EventName;
  timestamp: number;
  data: Record<string, unknown>;
}

export type EventHandler = (event: Event) => void | Promise<void>;

export interface EventBus {
  emit(name: EventName, data?: Record<string, unknown>): void;
  on(name: EventName, handler: EventHandler): () => void;
  off(name: EventName, handler: EventHandler): void;
  once(name: EventName, handler: EventHandler): void;
}
