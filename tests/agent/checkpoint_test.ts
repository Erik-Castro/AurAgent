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
  assertEquals(await ws.exists('novo.ts'), false); // arquivo novo removido, não vazio

  await cm.cleanup();
});

Deno.test('CheckpointManager cleanup não lança se diretório não existe', async () => {
  const cm = new CheckpointManager('/tmp/aur-nonexistent-dir');
  await cm.cleanup(); // não deve lançar
});

// --- SPEC-OC-001 §3.1.4: Testes obrigatórios ---

Deno.test('restore_new_file_removes', async () => {
  const ws = new MemoryWorkspace();
  const cm = new CheckpointManager(testDir);

  await cm.saveBeforeWrite('newfile.ts', 1, ws);
  await ws.write('newfile.ts', 'abc');
  assertEquals(await ws.exists('newfile.ts'), true);

  await cm.restoreLast(ws);
  assertEquals(await ws.exists('newfile.ts'), false);

  await cm.cleanup();
});

Deno.test('restore_existing_restores_bytes', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('old.ts', 'old');
  const cm = new CheckpointManager(testDir);

  await cm.saveBeforeWrite('old.ts', 1, ws);
  await ws.write('old.ts', 'new');
  await cm.restoreLast(ws);
  assertEquals(await ws.read('old.ts'), 'old');

  await cm.cleanup();
});

Deno.test('restore_existing_empty_original', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('empty.ts', '');
  const cm = new CheckpointManager(testDir);

  await cm.saveBeforeWrite('empty.ts', 1, ws);
  await ws.write('empty.ts', 'x');
  await cm.restoreLast(ws);
  assertEquals(await ws.exists('empty.ts'), true);
  assertEquals(await ws.read('empty.ts'), '');

  await cm.cleanup();
});

Deno.test('save_sets_existed_false', async () => {
  const ws = new MemoryWorkspace();
  const cm = new CheckpointManager(testDir);

  await cm.saveBeforeWrite('nonexistent.ts', 1, ws);
  // restore uses the entry's existed flag; verify by checking restore behavior
  // (existed=false + restoreLast should remove the file, not write empty)
  await ws.write('nonexistent.ts', 'temp');
  await cm.restoreLast(ws);
  assertEquals(await ws.exists('nonexistent.ts'), false);

  await cm.cleanup();
});

Deno.test('save_sets_existed_true', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('exists.ts', 'data');
  const cm = new CheckpointManager(testDir);

  await cm.saveBeforeWrite('exists.ts', 1, ws);
  await ws.write('exists.ts', 'modified');
  await cm.restoreLast(ws);
  assertEquals(await ws.read('exists.ts'), 'data');

  await cm.cleanup();
});
