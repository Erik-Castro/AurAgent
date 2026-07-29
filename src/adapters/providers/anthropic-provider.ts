import type {
  GenerateRequest,
  GenerateResponse,
  Message,
  ModelEvent,
  StreamRequest,
  ToolCall,
} from '../../core/types.ts';
import type { ModelProvider } from '../../ports/model-provider.ts';
import type { ProviderConfig } from './config.ts';

export class AnthropicProvider implements ModelProvider {
  constructor(private config: ProviderConfig) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const body = this.buildBody(request, false);
    const response = await fetch(`${this.config.baseUrl}/messages`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

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
          const response = await fetch(`${this.config.baseUrl}/messages`, {
            method: 'POST',
            headers: this.buildHeaders(),
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
          let toolAccumulator: { id: string; name: string; input: string } = {
            id: '',
            name: '',
            input: '',
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += value;

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('event: ')) continue;

              const eventType = trimmed.slice(7).trim();
              const nextLine = lines[lines.indexOf(line) + 1];
              const dataStr = nextLine?.startsWith('data: ')
                ? nextLine.slice(6).trim()
                : '';

              if (eventType === 'content_block_start' && dataStr) {
                try {
                  const block = JSON.parse(dataStr);
                  if (block.type === 'tool_use') {
                    toolAccumulator = {
                      id: block.id ?? crypto.randomUUID(),
                      name: block.name ?? '',
                      input: '',
                    };
                  }
                } catch {
                  // skip
                }
              }

              if (eventType === 'content_block_delta' && dataStr) {
                try {
                  const delta = JSON.parse(dataStr);
                  if (delta.type === 'text_delta' && delta.text) {
                    controller.enqueue({ type: 'token', text: delta.text });
                  }
                  if (
                    delta.type === 'input_json_delta' &&
                    delta.partial_json
                  ) {
                    toolAccumulator.input += delta.partial_json;
                  }
                } catch {
                  // skip
                }
              }

              if (eventType === 'message_delta' && dataStr) {
                try {
                  const delta = JSON.parse(dataStr);
                  if (
                    delta.delta?.stop_reason === 'tool_use' ||
                    delta.delta?.stop_reason === 'end_turn'
                  ) {
                    // will finalize on message_stop
                  }
                } catch {
                  // skip
                }
              }

              if (eventType === 'message_stop') {
                if (toolAccumulator.name) {
                  let parsed: Record<string, unknown> = {};
                  try {
                    parsed = JSON.parse(toolAccumulator.input);
                  } catch {
                    parsed = { raw: toolAccumulator.input };
                  }
                  controller.enqueue({
                    type: 'tool_call',
                    call: {
                      id: toolAccumulator.id,
                      name: toolAccumulator.name,
                      args: parsed,
                    },
                  });
                }

                controller.enqueue({
                  type: 'done',
                  finishReason: toolAccumulator.name
                    ? 'tool_calls'
                    : 'stop',
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

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }
    return headers;
  }

  private buildBody(
    request: GenerateRequest | StreamRequest,
    stream: boolean,
  ): Record<string, unknown> {
    const { system, messages } = this.separateSystem(request.messages);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens:
        'maxTokens' in request
          ? request.maxTokens ?? this.config.defaultMaxTokens ?? 4096
          : this.config.defaultMaxTokens ?? 4096,
      stream,
      temperature:
        'temperature' in request
          ? request.temperature ?? this.config.defaultTemperature ?? 0.7
          : this.config.defaultTemperature ?? 0.7,
    };

    if (system) {
      body.system = system;
    }

    if (
      'tools' in request &&
      request.tools &&
      request.tools.length > 0
    ) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    return body;
  }

  private separateSystem(
    messages: Message[],
  ): { system: string | null; messages: Record<string, unknown>[] } {
    let system: string | null = null;
    const rest: Message[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = system
          ? `${system}\n${msg.content}`
          : msg.content;
      } else {
        rest.push(msg);
      }
    }

    return {
      system,
      messages: rest.map((m) => {
        const base: Record<string, unknown> = {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        };
        if (m.role === 'tool') {
          base.role = 'user';
          base.content = [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId,
              content: m.content,
            },
          ];
        }
        if (
          m.role === 'assistant' &&
          m.toolCalls &&
          m.toolCalls.length > 0
        ) {
          base.content = [
            { type: 'text', text: m.content || '' },
            ...m.toolCalls.map((tc) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.args,
            })),
          ];
        }
        return base;
      }),
    };
  }

  private parseResponse(
    data: Record<string, unknown>,
  ): GenerateResponse {
    const content = data.content as
      | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown>; id?: string }>
      | undefined;

    let text = '';
    const toolCalls: ToolCall[] = [];

    if (content) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          text += block.text;
        }
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id ?? crypto.randomUUID(),
            name: block.name ?? '',
            args: (block.input as Record<string, unknown>) ?? {},
          });
        }
      }
    }

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason:
        (data.stop_reason as string) === 'tool_use'
          ? 'tool_calls'
          : 'stop',
    };
  }
}
