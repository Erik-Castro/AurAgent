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

export class GeminiProvider implements ModelProvider {
  constructor(private config: ProviderConfig) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const body = this.buildBody(request);
    const url = `${this.config.baseUrl}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
          const body = this.buildBody(request);
          const url =
            `${this.config.baseUrl}/v1beta/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

          const response = await fetch(url, {
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
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const payload = trimmed.slice(6).trim();
              if (payload === '[DONE]') {
                controller.enqueue({ type: 'done', finishReason: 'stop' });
                controller.close();
                return;
              }

              try {
                const chunk = JSON.parse(payload);
                const candidate = chunk.candidates?.[0];
                if (!candidate) continue;

                const part = candidate.content?.parts?.[0];
                if (!part) continue;

                if (part.text) {
                  controller.enqueue({ type: 'token', text: part.text });
                }

                if (part.functionCall) {
                  const fc = part.functionCall;
                  controller.enqueue({
                    type: 'tool_call',
                    call: {
                      id: crypto.randomUUID(),
                      name: fc.name ?? '',
                      args: (fc.args as Record<string, unknown>) ?? {},
                    },
                  });
                }

                if (candidate.finishReason) {
                  const reason = candidate.finishReason as string;
                  if (reason === 'STOP') {
                    controller.enqueue({ type: 'done', finishReason: 'stop' });
                  } else if (reason === 'TOOL_CALL' || reason === 'FUNCTION_CALL') {
                    controller.enqueue({
                      type: 'done',
                      finishReason: 'tool_calls',
                    });
                  } else if (reason === 'MAX_TOKENS') {
                    controller.enqueue({
                      type: 'done',
                      finishReason: 'length',
                    });
                  } else {
                    controller.enqueue({ type: 'done', finishReason: 'stop' });
                  }
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
  ): Record<string, unknown> {
    const { system, contents } = this.buildContents(request.messages);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature:
          'temperature' in request
            ? request.temperature ?? this.config.defaultTemperature ?? 0.7
            : this.config.defaultTemperature ?? 0.7,
        maxOutputTokens:
          'maxTokens' in request
            ? request.maxTokens ?? this.config.defaultMaxTokens ?? 4096
            : this.config.defaultMaxTokens ?? 4096,
      },
    };

    if (system) {
      body.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    if (
      'tools' in request &&
      request.tools &&
      request.tools.length > 0
    ) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    return body;
  }

  private buildContents(
    messages: Message[],
  ): { system: string | null; contents: Record<string, unknown>[] } {
    let system: string | null = null;
    const contents: Record<string, unknown>[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = system
          ? `${system}\n${msg.content}`
          : msg.content;
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: Record<string, unknown>[] = [];

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.args,
            },
          });
        }
      }

      if (msg.role === 'tool') {
        parts.push({
          functionResponse: {
            name: msg.name ?? '',
            response: { content: msg.content },
          },
        });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { system, contents };
  }

  private parseResponse(
    data: Record<string, unknown>,
  ): GenerateResponse {
    const candidate = (data.candidates as Array<Record<string, unknown>>)?.[0];
    if (!candidate) {
      return { content: '', finishReason: 'error' };
    }

    const parts = (candidate.content as Record<string, unknown>)?.parts as
      | Array<Record<string, unknown>>
      | undefined;

    let text = '';
    const toolCalls: ToolCall[] = [];

    if (parts) {
      for (const part of parts) {
        if (part.text) {
          text += part.text as string;
        }
        if (part.functionCall) {
          const fc = part.functionCall as Record<string, unknown>;
          toolCalls.push({
            id: crypto.randomUUID(),
            name: fc.name as string ?? '',
            args: (fc.args as Record<string, unknown>) ?? {},
          });
        }
      }
    }

    const finishReason = candidate.finishReason as string;
    const mappedReason =
      finishReason === 'TOOL_CALL' || finishReason === 'FUNCTION_CALL'
        ? 'tool_calls'
        : finishReason === 'MAX_TOKENS'
        ? 'length'
        : finishReason === 'STOP'
        ? 'stop'
        : 'stop';

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: mappedReason,
    };
  }
}
