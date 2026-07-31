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
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              try {
                const chunk = JSON.parse(trimmed);
                if (chunk.message?.content) {
                  controller.enqueue({
                    type: 'token',
                    text: chunk.message.content,
                  });
                }
                if (chunk.done) {
                  if (chunk.message?.tool_calls) {
                    for (const tc of chunk.message.tool_calls) {
                      let args: Record<string, unknown>;
                      try {
                        args = parseToolArguments(tc.function.arguments);
                      } catch {
                        args = {};
                      }
                      controller.enqueue({
                        type: 'tool_call',
                        call: {
                          id: crypto.randomUUID(),
                          name: tc.function.name,
                          args,
                        },
                      });
                    }
                  }
                  controller.enqueue({ type: 'done', finishReason: 'stop' });
                  controller.close();
                  return;
                }
              } catch {
                // skip malformed lines
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
      const raw = modelInfo?.['llama.context_length'] ??
        params?.num_ctx ??
        data.num_ctx ??
        data.context_length;
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
      content,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }
}
