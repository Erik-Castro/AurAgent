import type {
  GenerateRequest,
  GenerateResponse,
  Message,
  ModelEvent,
  StreamRequest,
  ToolCall,
  ToolDefinition,
} from '../../core/types.ts';
import type { ModelProvider } from '../../ports/model-provider.ts';
import type { ProviderConfig } from './config.ts';
import { parseToolArguments } from './parse-tool-args.ts';

export class OllamaProvider implements ModelProvider {
  constructor(private config: ProviderConfig) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const body = this.buildBody(request, false);
    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        await response.body?.cancel();
        return {
          content: `HTTP ${response.status}: ${text}`,
          finishReason: 'error',
        };
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (err) {
      return {
        content: `Erro de conexão: ${(err as Error).message}`,
        finishReason: 'error',
      };
    }
  }

  stream(request: StreamRequest): ReadableStream<ModelEvent> {
    return new ReadableStream<ModelEvent>({
      start: async (controller) => {
        try {
          const body = this.buildBody(request, true);
          const response = await fetch(`${this.config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            const text = await response.text();
            controller.enqueue({
              type: 'error',
              message: `HTTP ${response.status}: ${text}`,
            });
            controller.close();
            return;
          }

          const reader = response.body!
            .pipeThrough(new TextDecoderStream())
            .getReader();

          let buffer = '';
          let contentAcc = '';
          let thinkingAcc = '';
          const toolCallsAcc: ToolCall[] = [];
          const debug = Deno.env.get('AUR_DEBUG') === '1';
          const includeThinkingInContent =
            this.config.includeThinkingInContent ??
            Deno.env.get('AUR_THINKING_IN_CONTENT') === '1';

          const enqueueToolCall = (name: string, args: Record<string, unknown>) => {
            const call: ToolCall = { id: crypto.randomUUID(), name, args };
            const key = `${name}:${JSON.stringify(args)}`;
            if (toolCallsAcc.some((c) => `${c.name}:${JSON.stringify(c.args)}` === key)) {
              return;
            }
            toolCallsAcc.push(call);
            controller.enqueue({ type: 'tool_call', call });
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              let chunk: Record<string, unknown>;
              try {
                chunk = JSON.parse(trimmed);
              } catch {
                if (debug) {
                  const truncated = line.length > 200 ? line.slice(0, 200) : line;
                  Deno.stderr.writeSync(
                    new TextEncoder().encode(`[ollama] malformed line: ${truncated}\n`),
                  );
                }
                continue;
              }

              const msg = chunk.message as Record<string, unknown> | undefined;
              if (!msg && chunk.done !== true) continue;

              if (typeof msg?.thinking === 'string' && msg.thinking.length > 0) {
                thinkingAcc += msg.thinking;
                controller.enqueue({ type: 'thinking', text: msg.thinking });
                if (includeThinkingInContent) {
                  contentAcc += msg.thinking;
                  controller.enqueue({ type: 'token', text: msg.thinking });
                }
              }

              if (typeof msg?.content === 'string' && msg.content.length > 0) {
                contentAcc += msg.content;
                controller.enqueue({ type: 'token', text: msg.content });
              }

              if (Array.isArray(msg?.tool_calls)) {
                for (const tc of msg.tool_calls as Array<{
                  function?: { name?: unknown; arguments?: unknown };
                }>) {
                  const name = tc.function?.name;
                  if (typeof name !== 'string' || name.length === 0) continue;
                  let args: Record<string, unknown>;
                  try {
                    args = parseToolArguments(tc.function?.arguments);
                  } catch {
                    args = {};
                    if (debug) {
                      Deno.stderr.writeSync(
                        new TextEncoder().encode(`[ollama] invalid tool args for ${name}\n`),
                      );
                    }
                  }
                  enqueueToolCall(name, args);
                }
              }

              if (chunk.done === true) {
                controller.enqueue({
                  type: 'done',
                  finishReason: this.mapDoneReason(chunk),
                });
                controller.close();
                return;
              }
            }
          }

          controller.enqueue({ type: 'done', finishReason: 'stop' });
          controller.close();
        } catch (err) {
          controller.enqueue({
            type: 'error',
            message: (err as Error).message,
          });
          controller.close();
        }
      },
    });
  }

  private mapDoneReason(chunk: Record<string, unknown>): GenerateResponse['finishReason'] {
    const reason = chunk.done_reason as string | undefined;
    if (typeof reason === 'string' && reason.toLowerCase().includes('length')) {
      return 'length';
    }
    return 'stop';
  }

  private buildBody(
    request: GenerateRequest | StreamRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const options: Record<string, unknown> = {
      temperature: 'temperature' in request
        ? request.temperature ?? this.config.defaultTemperature ?? 0.7
        : this.config.defaultTemperature ?? 0.7,
      num_predict: 'maxTokens' in request
        ? request.maxTokens ?? this.config.defaultMaxTokens ?? 4096
        : this.config.defaultMaxTokens ?? 4096,
    };
    if (request.numCtx !== undefined && request.numCtx > 0) {
      options.num_ctx = request.numCtx;
    }

    return {
      model: this.config.model,
      messages: this.formatMessages(request.messages),
      stream,
      options,
      ...('tools' in request &&
          request.tools &&
          request.tools.length > 0
        ? { tools: this.formatTools(request.tools) }
        : {}),
    };
  }

  async getContextWindow(): Promise<number | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`${this.config.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.config.model }),
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const data = await response.json();
      const modelInfo = data.model_info as Record<string, unknown> | undefined;
      const params = data.parameters as Record<string, unknown> | undefined;
      const archKey = Object.keys(modelInfo ?? {}).find((k) =>
        k.endsWith('.context_length')
      );
      const raw = params?.num_ctx ??
        data.num_ctx ??
        data.context_length ??
        (archKey ? modelInfo![archKey] : undefined);
      if (typeof raw === 'number' && raw >= 512) return raw;
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private formatMessages(messages: Message[]): Record<string, unknown>[] {
    return messages.map((msg) => {
      const base: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.role === 'assistant') {
        if (msg.name) base.name = msg.name;
      }

      if (msg.role === 'tool') {
        base.name = msg.name ?? msg.toolCallId ?? 'unknown';
      }

      return base;
    });
  }

  private formatTools(
    tools: ToolDefinition[],
  ): Record<string, unknown>[] {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private parseResponse(data: Record<string, unknown>): GenerateResponse {
    const message = data.message as Record<string, unknown> | undefined;
    const content = (message?.content as string) ?? '';
    const thinking = (message?.thinking as string) ?? '';
    const effectiveContent = content.trim() !== '' ? content : thinking;
    const rawToolCalls = message?.tool_calls as
      | Array<{
        function: { name: string; arguments: unknown };
      }>
      | undefined;

    const toolCalls: ToolCall[] | undefined = rawToolCalls?.map((tc) => ({
      id: crypto.randomUUID(),
      name: tc.function.name,
      args: parseToolArguments(tc.function.arguments),
    }));

    return {
      content: effectiveContent,
      thinking: thinking.trim() !== '' ? thinking : undefined,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }
}
