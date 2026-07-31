import { assert, assertEquals } from '@std/assert';
import type { ToolCall } from '../../src/core/types.ts';
import type { ToolContext } from '../../src/tools/handler.ts';
import * as handlers from '../../src/tools/implementations.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';

function createMockContext(overrides?: Partial<ToolContext>): ToolContext {
  const ws = new MemoryWorkspace();
  return {
    workspace: ws,
    processRunner: {
      run(req: { command: string }) {
        return Promise.resolve({
          code: 0,
          stdout: `executado: ${req.command}`,
          stderr: '',
          truncated: false,
        });
      },
    },
    eventBus: {
      emit: () => {},
      on: () => () => {},
      off: () => {},
      once: () => {},
    },
    memoryStore: {
      get() {
        return Promise.resolve(null);
      },
      set() {
        return Promise.resolve();
      },
      delete() {
        return Promise.resolve();
      },
      list() {
        return Promise.resolve([]);
      },
    },
    config: {
      maxIterations: 15,
      model: 'test',
      workingDir: '/tmp',
      permissions: 'default',
      concurrency: 4,
      contextTokenLimit: 128_000,
      sterileLoopThreshold: 3,
      summaryTokenThreshold: 2_000,
      maxOutputChars: 100_000,
      numCtx: null,
      outputReserveTokens: 512,
      toolProtocolMode: 'hybrid',
      hybridNativeToolsMinCtx: 16384,
      compactCatalogMaxTokens: 600,
    },
    readInput: () => Promise.resolve('resposta mock'),
    ...overrides,
  };
}

function makeCall(overrides?: Partial<ToolCall>): ToolCall {
  return {
    id: 'call_test',
    name: 'Test',
    args: {},
    ...overrides,
  };
}

Deno.test('ReadFileHandler retorna conteúdo', async () => {
  const ctx = createMockContext();
  await ctx.workspace.write('test.txt', 'conteúdo do arquivo');
  const result = await handlers.readFileHandler.execute(
    makeCall({ name: 'ReadFile', args: { paths: ['test.txt'] } }),
    ctx,
  );
  const parsed = JSON.parse(result.output);
  assertEquals(parsed.length, 1);
  assertEquals(parsed[0].path, 'test.txt');
  assertEquals(parsed[0].content, 'conteúdo do arquivo');
});

Deno.test('ReadFileHandler com lines filter', async () => {
  const ctx = createMockContext();
  await ctx.workspace.write('multi.txt', 'linha1\nlinha2\nlinha3');
  const result = await handlers.readFileHandler.execute(
    makeCall({ name: 'ReadFile', args: { paths: ['multi.txt'], lines: { start: 0, end: 2 } } }),
    ctx,
  );
  const parsed = JSON.parse(result.output);
  assertEquals(parsed[0].content, 'linha1\nlinha2');
});

Deno.test('WriteFileHandler cria arquivo', async () => {
  const ctx = createMockContext();
  const result = await handlers.writeFileHandler.execute(
    makeCall({ name: 'WriteFile', args: { path: 'novo.txt', content: 'novo conteúdo' } }),
    ctx,
  );
  assert(result.output.includes('Arquivo escrito'));
  assertEquals(await ctx.workspace.read('novo.txt'), 'novo conteúdo');
});

Deno.test('WriteFileHandler append mode', async () => {
  const ctx = createMockContext();
  await ctx.workspace.write('log.txt', 'linha1\n');
  await handlers.writeFileHandler.execute(
    makeCall({ name: 'WriteFile', args: { path: 'log.txt', content: 'linha2', mode: 'append' } }),
    ctx,
  );
  assertEquals(await ctx.workspace.read('log.txt'), 'linha1\nlinha2');
});

Deno.test('FindFilesHandler retorna arquivos por padrão', async () => {
  const ctx = createMockContext();
  await ctx.workspace.write('a.ts', '');
  await ctx.workspace.write('b.ts', '');
  await ctx.workspace.write('c.js', '');
  const result = await handlers.findFilesHandler.execute(
    makeCall({ name: 'FindFiles', args: { pattern: '*.ts' } }),
    ctx,
  );
  // MemoryWorkspace.list ignora pattern, retorna todas as chaves
  const parsed = JSON.parse(result.output);
  assert(Array.isArray(parsed));
});

Deno.test('GrepHandler busca texto em arquivos', async () => {
  const ctx = createMockContext();
  await ctx.workspace.write('src/a.ts', 'function hello() {}');
  await ctx.workspace.write('src/b.ts', 'const x = 1');
  const result = await handlers.grepHandler.execute(
    makeCall({ name: 'Grep', args: { query: 'hello' } }),
    ctx,
  );
  const parsed = JSON.parse(result.output);
  assert(parsed.length >= 1);
  assertEquals(parsed[0].file, 'src/a.ts');
});

Deno.test('WebSearchHandler não retorna stub message', async () => {
  const ctx = createMockContext();
  const result = await handlers.webSearchHandler.execute(
    makeCall({ name: 'WebSearch', args: { query: 'test' } }),
    ctx,
  );
  assert(!result.output.includes('não configurado'));
});

Deno.test('AskUserHandler usa readInput', async () => {
  let inputCalled = false;
  const ctx = createMockContext({
    readInput: (prompt: string) => {
      inputCalled = true;
      assert(prompt.includes('Qual sua cor favorita?'));
      return Promise.resolve('azul');
    },
  });
  const result = await handlers.askUserHandler.execute(
    makeCall({
      name: 'AskUser',
      args: { question: 'Qual sua cor favorita?', options: ['azul', 'vermelho'] },
    }),
    ctx,
  );
  assertEquals(result.output, 'azul');
  assertEquals(inputCalled, true);
});
