import { assertEquals, assertRejects } from '@std/assert';
import { ReadOnlyGuard } from '../../src/agent/read-only-guard.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';
import { PermissionError } from '../../src/core/errors.ts';

Deno.test('read/exists/list/readMultiple passam para inner', async () => {
  const inner = new MemoryWorkspace();
  await inner.write('/tmp/test.txt', 'conteúdo');
  const guard = new ReadOnlyGuard(inner);

  assertEquals(await guard.read('/tmp/test.txt'), 'conteúdo');
  assertEquals(await guard.exists('/tmp/test.txt'), true);
  assertEquals(await guard.exists('/tmp/nonexistent'), false);
  const entries = await guard.list();
  assertEquals(entries.length, 1);

  const multi = await guard.readMultiple(['/tmp/test.txt']);
  assertEquals(multi.length, 1);
  assertEquals(multi[0].content, 'conteúdo');
});

Deno.test('write lança PermissionError', async () => {
  const inner = new MemoryWorkspace();
  const guard = new ReadOnlyGuard(inner);

  await assertRejects(
    () => guard.write('/tmp/test.txt', 'novo'),
    PermissionError,
    'somente leitura',
  );
});

Deno.test('remove lança PermissionError', async () => {
  const inner = new MemoryWorkspace();
  await inner.write('/tmp/test.txt', 'x');
  const guard = new ReadOnlyGuard(inner);

  await assertRejects(
    () => guard.remove('/tmp/test.txt'),
    PermissionError,
    'remover',
  );
});

Deno.test('inner permanece intacto após rejeição do guard', async () => {
  const inner = new MemoryWorkspace();
  const guard = new ReadOnlyGuard(inner);

  await assertRejects(() => guard.write('/tmp/x.txt', 'conteúdo'));
  assertEquals(await inner.exists('/tmp/x.txt'), false);
  assertEquals(await inner.list(), []);
});
