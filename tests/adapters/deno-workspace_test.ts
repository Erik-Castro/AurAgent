import { assertEquals, assert, assertRejects } from '@std/assert';
import { DenoWorkspace } from '../../src/adapters/deno-workspace.ts';
import { WorkspacePathError } from '../../src/core/errors.ts';

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

// --- SPEC-OC-001 §3.3.5: Path safety tests ---

Deno.test({
  name: 'path safety: rejeita ../ (traversal)',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await assertRejects(
      () => ws.write('../escape.txt', 'data'),
      WorkspacePathError,
    );
    await assertRejects(
      () => ws.write('../', 'data'),
      WorkspacePathError,
    );
    await assertRejects(
      () => ws.write('..', 'data'),
      WorkspacePathError,
    );

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'path safety: rejeita path absoluto fora do workspace',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await assertRejects(
      () => ws.write('/etc/passwd', 'data'),
      WorkspacePathError,
    );

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'path safety: rejeita path vazio',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await assertRejects(
      () => ws.write('', 'data'),
      WorkspacePathError,
    );

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'path safety: rejeita foo/../../etc/passwd',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await assertRejects(
      () => ws.write('foo/../../etc/passwd', 'data'),
      WorkspacePathError,
    );

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: 'path safety: aceita path dentro do workspace',
  async fn() {
    await Deno.mkdir(testDir, { recursive: true });
    const ws = new DenoWorkspace(testDir);

    await ws.write('helloworld.js', 'ok');
    assertEquals(await ws.exists('helloworld.js'), true);
    await ws.write('src/a.ts', 'ok');
    assertEquals(await ws.exists('src/a.ts'), true);

    await Deno.remove(testDir, { recursive: true });
  },
});
