import { assertEquals, assert } from '@std/assert';
import { DenoWorkspace } from '../../src/adapters/deno-workspace.ts';

const testDir = '/tmp/aur-test-workspace';

Deno.test({
  name: 'DenoWorkspace escreve e lê arquivo',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('test.txt', 'conteúdo de teste');
    const content = await ws.read('test.txt');
    assertEquals(content, 'conteúdo de teste');

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'DenoWorkspace exists retorna true/false',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('existe.txt', 'x');
    assertEquals(await ws.exists('existe.txt'), true);
    assertEquals(await ws.exists('nao-existe.txt'), false);

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'DenoWorkspace remove arquivo',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('temp.txt', 'temporário');
    assertEquals(await ws.exists('temp.txt'), true);
    await ws.remove('temp.txt');
    assertEquals(await ws.exists('temp.txt'), false);

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'DenoWorkspace list retorna arquivos',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('a.ts', '');
    await Deno.mkdir(`${testDir}/sub`, { recursive: true });
    await ws.write('sub/b.ts', '');

    const files = await ws.list();
    assert(files.length >= 2);
    assert(files.some((f) => f.endsWith('a.ts')));
    assert(files.some((f) => f.endsWith('b.ts')));

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'DenoWorkspace readMultiple retorna múltiplos arquivos',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('a.txt', 'aaa');
    await ws.write('b.txt', 'bbb');

    const entries = await ws.readMultiple(['a.txt', 'b.txt']);
    assertEquals(entries.length, 2);
    assertEquals(entries[0].content, 'aaa');
    assertEquals(entries[1].content, 'bbb');

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'DenoWorkspace cria diretórios automaticamente no write',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('dir1/dir2/profundo.txt', 'profundo');
    assertEquals(await ws.exists('dir1/dir2/profundo.txt'), true);

    await Deno.remove(testDir, { recursive: true });
  },
});
