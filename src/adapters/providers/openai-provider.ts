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

export class OpenAIProvider implements ModelProvider {
  constructor(private config: ProviderConfig) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const body = this.buildBody(request, false);
    const response = await fetch(
      `${this.config.baseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      await response.body?.cancel();
      return { content: '', finishReason: 'error' };
    }

    const data = await response.json();
    return this.parseResponse(data);
  }

  stream(request: StreamRequest): ReadableStream<ModelEvent> {
    return new ReadableStream<ModelEvent>({
      start: async (controller) => {
        try {
          const body = this.buildBody(request, true);
          const response = await fetch(
            `${this.config.baseUrl}/chat/completions`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiKey
                  ? { Authorization: `Bearer ${this.config.apiKey}` }
                  : {}),
              },
              body: JSON.stringify(body),
            },
          );

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
          const accumulatedTools = new Map<
            number,
            { id?: string; name?: string; arguments: string }
          >();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const payload = trimmed.slice(6).trim();
              if (payload === '[DONE]') {
                controller.enqueue({
                  type: 'done',
                  finishReason: 'stop',
                });
                controller.close();
                return;
              }

              try {
                const chunk = JSON.parse(payload);
                const choice = chunk.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta ?? {};
                if (delta.content) {
                  controller.enqueue({ type: 'token', text: delta.content });
                }

                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!accumulatedTools.has(idx)) {
                      accumulatedTools.set(idx, { arguments: '' });
                    }
                    const acc = accumulatedTools.get(idx)!;
                    if (tc.id) acc.id = tc.id;
                    if (tc.function?.name) acc.name = tc.function.name;
                    if (tc.function?.arguments) {
                      acc.arguments += tc.function.arguments;
                    }
                  }
                }

                if (choice.finish_reason === 'tool_calls') {
                  for (const [, acc] of accumulatedTools) {
                    let parsed: Record<string, unknown> = {};
                    try {
                      parsed = JSON.parse(acc.arguments);
                    } catch {
                      parsed = { raw: acc.arguments };
                    }
                    controller.enqueue({
                      type: 'tool_call',
                      call: {
                        id: acc.id ?? crypto.randomUUID(),
                        name: acc.name ?? '',
                        args: parsed,
                      },
                    });
                  }

                  controller.enqueue({
                    type: 'done',
                    finishReason: 'tool_calls',
                  });
                  controller.close();
                  return;
                }
              } catch {
                // skip malformed JSON
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
    return {
      model: this.config.model,
      messages: this.formatMessages(request.messages),
      stream,
      temperature:
        'temperature' in request
          ? request.temperature ?? this.config.defaultTemperature ?? 0.7
          : this.config.defaultTemperature ?? 0.7,
      max_tokens:
        'maxTokens' in request
          ? request.maxTokens ?? this.config.defaultMaxTokens ?? 4096
          : this.config.defaultMaxTokens ?? 4096,
      ...('tools' in request &&
      request.tools &&
      request.tools.length > 0
        ? { tools: this.formatTools(request.tools) }
        : {}),
    };
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
        base.tool_call_id = msg.toolCallId ?? msg.name ?? '';
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
    const choices = data.choices as
      | Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: {
              name?: string;
              arguments?: string;
            };
          }>;
        };
        finish_reason?: string;
      }>
      | undefined;

    const choice = choices?.[0];
    if (!choice) {
      return { content: '', finishReason: 'error' };
    }

    const content = choice.message?.content ?? '';
    const rawToolCalls = choice.message?.tool_calls;
    const finishReason = choice.finish_reason as
      | 'stop'
      | 'tool_calls'
      | 'length'
      | 'error';
    const mappedReason =
      finishReason === 'tool_calls'
        ? 'tool_calls'
        : finishReason === 'length'
        ? 'length'
        : finishReason === 'error' || !finishReason
        ? 'error'
        : 'stop';

    const toolCalls: ToolCall[] | undefined = rawToolCalls?.map((tc) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(tc.function?.arguments ?? '{}');
      } catch {
        parsed = { raw: tc.function?.arguments ?? '' };
      }
      return {
        id: tc.id ?? crypto.randomUUID(),
        name: tc.function?.name ?? '',
        args: parsed,
      };
    });

    return {
      content,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: mappedReason,
    };
  }
}
