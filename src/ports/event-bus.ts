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
  | 'tool:gate_failed'
  | 'tool:timeout'
  | 'tool:repeat_warning'
  | 'model:request_started'
  | 'model:request_finished'
  | 'checkpoint:created'
  | 'checkpoint:restored'
  | 'memory:loaded'
  | 'memory:persisted'
  | 'context:summarized'
  | 'context:compressed'
  | 'state:initialized'
  | 'state:updated'
  | 'prompt:built'
  | 'cache:hit'
  | 'cache:miss'
  | 'cache:store';

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
