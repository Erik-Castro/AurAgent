import { assertEquals } from '@std/assert';
import { InMemoryEventBus } from '../../src/adapters/event-bus.ts';
import type { Event } from '../../src/ports/event-bus.ts';

Deno.test('EventBus emite e recebe eventos', () => {
  const bus = new InMemoryEventBus();
  let received: Event | undefined;

  bus.on('task:started', (e) => {
    received = e;
  });

  bus.emit('task:started', { task: 'test' });
  assertEquals(received!.name, 'task:started');
  assertEquals(received!.data.task, 'test');
  assertEquals(typeof received!.timestamp, 'number');
});

Deno.test('EventBus on retorna unsubscribe function', () => {
  const bus = new InMemoryEventBus();
  let count = 0;

  const unsub = bus.on('tool:started', () => {
    count++;
  });

  bus.emit('tool:started', {});
  assertEquals(count, 1);

  unsub();
  bus.emit('tool:started', {});
  assertEquals(count, 1); // não incrementou após unsubscribe
});

Deno.test('EventBus once executa apenas uma vez', () => {
  const bus = new InMemoryEventBus();
  let count = 0;

  bus.once('tool:finished', () => {
    count++;
  });

  bus.emit('tool:finished', {});
  bus.emit('tool:finished', {});
  assertEquals(count, 1);
});

Deno.test('EventBus erros em handlers não afetam outros', () => {
  const bus = new InMemoryEventBus();
  let secondCalled = false;

  bus.on('iteration:started', () => {
    throw new Error('handler error');
  });
  bus.on('iteration:started', () => {
    secondCalled = true;
  });

  bus.emit('iteration:started', { iteration: 1 });
  assertEquals(secondCalled, true);
});

Deno.test('EventBus off remove handler específico', () => {
  const bus = new InMemoryEventBus();
  let count = 0;

  const handler = () => { count++; };
  bus.on('tool:failed', handler);
  bus.emit('tool:failed', {});
  assertEquals(count, 1);

  bus.off('tool:failed', handler);
  bus.emit('tool:failed', {});
  assertEquals(count, 1);
});
