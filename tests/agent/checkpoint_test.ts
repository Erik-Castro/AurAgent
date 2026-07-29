import { assertEquals, assert, assertRejects } from '@std/assert';
import { CheckpointManager } from '../../src/agent/checkpoint.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';
import { InMemoryEventBus } from '../../src/adapters/event-bus.ts';

const testDir = '/tmp/aur-test-checkpoints';

Deno.test('CheckpointManager salva e restaura checkpoint', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('/tmp/test.ts', 'original');
  const cm = new CheckpointManager(testDir);

  const id = await cm.saveBeforeWrite('/tmp/test.ts', 1, ws);
  assert(id.startsWith('iter-1'));

  await ws.write('/tmp/test.ts', 'modificado');
  assertEquals(await ws.read('/tmp/test.ts'), 'modificado');

  await cm.restore(id, ws);
  assertEquals(await ws.read('/tmp/test.ts'), 'original');

  await cm.cleanup();
});

Deno.test('CheckpointManager restoreLast restaura último', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('a.ts', 'a');
  const cm = new CheckpointManager(testDir);

  await cm.saveBeforeWrite('a.ts', 1, ws);
  await ws.write('a.ts', 'b');
  await cm.restoreLast(ws);
  assertEquals(await ws.read('a.ts'), 'a');

  await cm.cleanup();
});

Deno.test('CheckpointManager restore lança erro para id inválido', async () => {
  const ws = new MemoryWorkspace();
  const cm = new CheckpointManager(testDir);

  await assertRejects(
    () => cm.restore('inexistente', ws),
    Error,
    'não encontrado',
  );

  await cm.cleanup();
});

Deno.test('CheckpointManager emite eventos quando eventBus fornecido', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('b.ts', 'original');
  const bus = new InMemoryEventBus();
  const cm = new CheckpointManager(testDir, bus);

  let createdId = '';
  let createdPath = '';
  bus.on('checkpoint:created', (e) => {
    createdId = e.data.id as string;
    createdPath = e.data.filePath as string;
  });

  const id = await cm.saveBeforeWrite('b.ts', 1, ws);
  assertEquals(createdId, id);
  assertEquals(createdPath, 'b.ts');

  let restoredId = '';
  bus.on('checkpoint:restored', (e) => {
    restoredId = e.data.id as string;
  });

  await cm.restore(id, ws);
  assertEquals(restoredId, id);

  await cm.cleanup();
});

Deno.test('CheckpointManager arquivo novo tem conteúdo vazio', async () => {
  const ws = new MemoryWorkspace();
  const cm = new CheckpointManager(testDir);

  const id = await cm.saveBeforeWrite('novo.ts', 2, ws);
  await ws.write('novo.ts', 'conteudo');
  await cm.restore(id, ws);
  assertEquals(await ws.read('novo.ts'), ''); // volta a vazio

  await cm.cleanup();
});

Deno.test('CheckpointManager cleanup não lança se diretório não existe', async () => {
  const cm = new CheckpointManager('/tmp/aur-nonexistent-dir');
  await cm.cleanup(); // não deve lançar
});
