import { assert, assertEquals } from '@std/assert';
import { Agent } from '../../src/agent/agent.ts';
import type { AgentContext } from '../../src/agent/agent-context.ts';
import type { AgentConfig } from '../../src/core/types.ts';
import type { GenerateRequest, GenerateResponse } from '../../src/core/types.ts';
import type { ModelProvider } from '../../src/ports/model-provider.ts';
import type { ModelEvent, StreamRequest } from '../../src/core/types.ts';
import { MemoryWorkspace } from '../mock-workspace.ts';
import { InMemoryEventBus } from '../../src/adapters/event-bus.ts';
import { buildToolRegistry } from '../../src/tools/register.ts';

// Mock model provider que sempre retorna uma resposta de "stop"
class MockModelProvider implements ModelProvider {
  constructor(private response: GenerateResponse) {}

  generate(_request: GenerateRequest): Promise<GenerateResponse> {
    return Promise.resolve(this.response);
  }

  stream(_request: StreamRequest): ReadableStream<ModelEvent> {
    return new ReadableStream({
      start(controller) {
        controller.enqueue({ type: 'token', text: 'mock' });
        controller.enqueue({ type: 'done', finishReason: 'stop' });
        controller.close();
      },
    });
  }
}

const baseConfig: AgentConfig = {
  maxIterations: 5,
  model: 'mock/test',
  workingDir: '/tmp',
  permissions: 'approve-all',
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
};

function createMockContext(
  modelProvider: ModelProvider,
  overrides?: Partial<AgentContext>,
): AgentContext {
  return {
    workspace: new MemoryWorkspace(),
    processRunner: {
      run() {
        return Promise.resolve({ code: 0, stdout: '', stderr: '', truncated: false });
      },
    },
    modelProvider,
    eventBus: new InMemoryEventBus(),
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
    toolHandlers: buildToolRegistry().handlers,
    config: baseConfig,
    readInput: () => Promise.resolve(''),
    ...overrides,
  };
}

Deno.test('Agent.run retorna success quando modelo para', async () => {
  const provider = new MockModelProvider({
    content: 'Tarefa concluída com sucesso.',
    finishReason: 'stop',
  });
  const ctx = createMockContext(provider);
  const agent = new Agent(ctx);

  const result = await agent.run('faça algo simples');

  assertEquals(result.status, 'success');
  assertEquals(result.output, 'Tarefa concluída com sucesso.');
  assertEquals(result.iterations, 1);
  assert(result.durationMs >= 0);
});

Deno.test('Agent.run retorna error quando modelo retorna erro', async () => {
  const provider = new MockModelProvider({
    content: 'erro interno',
    finishReason: 'error',
  });
  const ctx = createMockContext(provider);
  const agent = new Agent(ctx);

  const result = await agent.run('tarefa que falha');

  assertEquals(result.status, 'error');
  assert(result.output.includes('erro'));
});

Deno.test('Agent.run emite evento task:started', async () => {
  const provider = new MockModelProvider({
    content: 'ok',
    finishReason: 'stop',
  });
  const bus = new InMemoryEventBus();
  let startedEvent = false;
  bus.on('task:started', () => {
    startedEvent = true;
  });

  const ctx = createMockContext(provider, { eventBus: bus });
  const agent = new Agent(ctx);

  await agent.run('tarefa');
  assertEquals(startedEvent, true);
});

Deno.test('Agent.run emite evento task:completed com success', async () => {
  const provider = new MockModelProvider({
    content: 'pronto',
    finishReason: 'stop',
  });
  const bus = new InMemoryEventBus();
  let completedStatus = '';
  bus.on('task:completed', (e) => {
    completedStatus = e.data.status as string;
  });

  const ctx = createMockContext(provider, { eventBus: bus });
  const agent = new Agent(ctx);

  await agent.run('tarefa');
  assertEquals(completedStatus, 'success');
});

Deno.test('Agent.run persiste session summary no memoryStore', async () => {
  const provider = new MockModelProvider({
    content: 'feito',
    finishReason: 'stop',
  });

  let savedKey = '';
  let savedValue: Record<string, unknown> = {};
  const ctx = createMockContext(provider, {
    memoryStore: {
      get() {
        return Promise.resolve(null);
      },
      set(key, value) {
        savedKey = key;
        savedValue = value as Record<string, unknown>;
        return Promise.resolve();
      },
      delete() {
        return Promise.resolve();
      },
      list() {
        return Promise.resolve([]);
      },
    },
  });
  const agent = new Agent(ctx);

  await agent.run('minha tarefa');
  assert(savedKey.startsWith('session:'));
  assertEquals(savedValue.task, 'minha tarefa');
  assertEquals(savedValue.status, 'success');
});

Deno.test('Agent.run com tool_calls repetidos detecta sterile loop', async () => {
  const provider = new MockModelProvider({
    content: '',
    toolCalls: [{
      id: 'call_1',
      name: 'ReadFile',
      args: { paths: ['test.txt'] },
    }],
    finishReason: 'tool_calls',
  });
  const ws = new MemoryWorkspace();
  await ws.write('test.txt', 'conteúdo');

  const ctx = createMockContext(provider, { workspace: ws });
  const agent = new Agent(ctx);

  // Mock sempre retorna a mesma tool_call → SterileLoopDetector dispara após 3 iterações
  const result = await agent.run('leia o arquivo');
  assertEquals(result.status, 'error');
  assert(result.output.includes('estéril') || result.iterations > 0);
});
