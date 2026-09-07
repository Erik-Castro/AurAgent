import { assert, assertEquals } from '@std/assert';
import { WorkingMemory } from '../../src/agent/memory.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';
import type { AgentConfig } from '../../src/core/types.ts';

const defaultConfig: AgentConfig = {
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

Deno.test('addSystem adiciona mensagem system', () => {
  const mem = new WorkingMemory(defaultConfig);
  mem.addSystem('Seja um agente útil');
  const msgs = mem.getMessages();
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].role, 'system');
  assertEquals(msgs[0].content, 'Seja um agente útil');
});

Deno.test('addUser adiciona mensagem user', () => {
  const mem = new WorkingMemory(defaultConfig);
  mem.addUser('faça algo');
  const msgs = mem.getMessages();
  assertEquals(msgs.length, 1);
  assertEquals(msgs[0].role, 'user');
  assertEquals(msgs[0].content, 'faça algo');
});

Deno.test('addAssistant com e sem toolCalls', () => {
  const mem = new WorkingMemory(defaultConfig);
  mem.addAssistant('sem tools');
  assertEquals(mem.getMessages()[0].toolCalls, undefined);

  mem.addAssistant('com tools', [
    { id: 'call_1', name: 'read_file', args: { path: 'x.ts' } },
  ]);
  assertEquals(mem.getMessages()[1].toolCalls?.length, 1);
  assertEquals(mem.getMessages()[1].toolCalls![0].name, 'read_file');
});

Deno.test('addToolResult trunca acima do threshold', () => {
  const config: AgentConfig = { ...defaultConfig, summaryTokenThreshold: 1 };
  const mem = new WorkingMemory(config);
  const longContent = 'x'.repeat(100);
  mem.addToolResult('call_1', longContent, 'bash');
  const msg = mem.getMessages()[0];
  assert(msg.content.length < longContent.length);
  assert(msg.content.includes('truncado'));
  assertEquals(msg.role, 'tool');
  assertEquals(msg.toolCallId, 'call_1');
  assertEquals(msg.name, 'bash');
});

Deno.test('addToolResult não trunca abaixo do threshold', () => {
  const mem = new WorkingMemory(defaultConfig);
  const content = 'resultado curto';
  mem.addToolResult('call_2', content, 'ls');
  assertEquals(mem.getMessages()[0].content, content);
});

Deno.test('compressWithSummary não faz nada quando há poucas mensagens', () => {
  const mem = new WorkingMemory(defaultConfig);
  for (let i = 0; i < 3; i++) {
    mem.addUser(`msg ${i}`);
  }
  assertEquals(mem.getMessageCount(), 3);
  mem.compressWithSummary('<compacted-summary>test</compacted-summary>');
  assertEquals(mem.getMessageCount(), 3);
});

Deno.test('compressWithSummary compacta mensagens antigas mantendo system e recentes', () => {
  const mem = new WorkingMemory(defaultConfig);
  mem.addSystem('system prompt');
  for (let i = 0; i < 15; i++) {
    mem.addUser(`user ${i}`);
    mem.addAssistant(`resp ${i}`);
  }
  const totalBefore = mem.getMessageCount(); // system + 15*2 = 31
  assert(totalBefore > 4);
  mem.compressWithSummary('<compacted-summary>old context</compacted-summary>');
  const msgs = mem.getMessages();
  // Should have: system + summary + last 4 messages
  assert(msgs.length < totalBefore);
  assertEquals(msgs[0].role, 'system');
  assertEquals(msgs[0].content, 'system prompt');
  assertEquals(msgs[1].role, 'system');
  assert(msgs[1].content.startsWith('<compacted-summary>'));
});

Deno.test('compressWithSummary preserva system como primeira mensagem', () => {
  const mem = new WorkingMemory(defaultConfig);
  mem.addSystem('system prompt');
  for (let i = 0; i < 10; i++) {
    mem.addUser(`msg ${i}`);
  }
  mem.compressWithSummary('<compacted-summary>ctx</compacted-summary>');
  const msgs = mem.getMessages();
  assertEquals(msgs[0].role, 'system');
  assertEquals(msgs[0].content, 'system prompt');
  assertEquals(msgs[1].content, '<compacted-summary>ctx</compacted-summary>');
});

Deno.test('loadInstructionFiles do workspace', async () => {
  const mem = new WorkingMemory(defaultConfig);
  const ws = new MemoryWorkspace();
  await ws.write('AGENT.md', 'siga as regras');
  const systemIdx = mem.getMessageCount();
  await mem.loadInstructionFiles(ws);
  assert(mem.getMessageCount() > systemIdx);
  const sysMsg = mem.getMessages()[0];
  assert(sysMsg.content.includes('AGENT.md'));
  assert(sysMsg.content.includes('siga as regras'));
});
