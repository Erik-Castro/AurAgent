import { assert, assertEquals } from '@std/assert';
import type { AgentConfig } from '../../src/core/types.ts';
import { indexWorkspace } from '../../src/agent/workspace-snapshot.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';

const config: AgentConfig = {
  maxIterations: 15,
  model: 'test-model',
  workingDir: '/test',
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
  maxRecentActions: 3,
  maxOpenErrors: 5,
  maxPlanSteps: 12,
  maxArtifactsInPrompt: 30,
  useExecutionState: true,
};

Deno.test('indexWorkspace indexa arquivos como preexisting', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('a.ts', 'export const a = 1;');
  await ws.write('b.ts', 'export const b = 2;');

  const index = await indexWorkspace(ws, config);

  assert(index.length >= 2);
  const a = index.find((r) => r.path === 'a.ts');
  assert(a);
  assertEquals(a.source, 'preexisting');
  assert(a.size > 0);
  assertEquals(a.updatedAtIteration, 0);
});

Deno.test('indexWorkspace exclui node_modules, .git e .aur', async () => {
  const ws = new MemoryWorkspace();
  await ws.write('src/app.ts', 'export {};');
  await ws.write('node_modules/pkg/index.js', 'x');
  await ws.write('.git/config', 'x');
  await ws.write('.aur/security.json', 'x');

  const index = await indexWorkspace(ws, config);
  const paths = index.map((r) => r.path);

  assert(paths.includes('src/app.ts'));
  assert(!paths.some((p) => p.includes('node_modules')));
  assert(!paths.some((p) => p.includes('.git')));
  assert(!paths.some((p) => p.includes('.aur')));
});

Deno.test('indexWorkspace respeita cap de 5000 entradas do listing', async () => {
  const ws = new MemoryWorkspace();
  for (let i = 0; i < 6000; i++) {
    await ws.write(`f${String(i).padStart(4, '0')}.txt`, 'x');
  }
  const bigCap: AgentConfig = { ...config, maxArtifactsInPrompt: 6000 };
  const index = await indexWorkspace(ws, bigCap);
  assertEquals(index.length, 5000);
});

Deno.test('indexWorkspace respeita maxArtifactsInPrompt', async () => {
  const ws = new MemoryWorkspace();
  for (let i = 0; i < 100; i++) {
    await ws.write(`f${String(i).padStart(4, '0')}.txt`, 'x');
  }
  const index = await indexWorkspace(ws, config);
  assertEquals(index.length, config.maxArtifactsInPrompt);
});

Deno.test('indexWorkspace retorna [] para workspace vazio', async () => {
  const ws = new MemoryWorkspace();
  const index = await indexWorkspace(ws, config);
  assertEquals(index.length, 0);
});
