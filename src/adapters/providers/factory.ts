import type { ModelProvider } from '../../ports/model-provider.ts';
import { ConfigurationError } from '../../core/errors.ts';
import type { ProviderConfig } from './config.ts';
import { OllamaProvider } from './ollama-provider.ts';
import { OpenAIProvider } from './openai-provider.ts';
import { AnthropicProvider } from './anthropic-provider.ts';
import { GeminiProvider } from './gemini-provider.ts';

export function createModelProvider(
  modelString: string,
  overrides?: Partial<ProviderConfig>,
): ModelProvider {
  const slashIdx = modelString.indexOf('/');
  const providerType = slashIdx === -1
    ? modelString
    : modelString.slice(0, slashIdx);
  const modelName = slashIdx === -1 ? '' : modelString.slice(slashIdx + 1);

  switch (providerType) {
    case 'ollama': {
      return new OllamaProvider({
        baseUrl: Deno.env.get('OLLAMA_HOST') ?? 'http://localhost:11434',
        model: modelName || 'qwen2.5-coder:7b',
        ...overrides,
      });
    }

    case 'openai': {
      return new OpenAIProvider({
        baseUrl:
          overrides?.baseUrl ??
          Deno.env.get('OPENAI_BASE_URL') ??
          'https://api.openai.com/v1',
        apiKey: overrides?.apiKey ?? Deno.env.get('OPENAI_API_KEY'),
        model: modelName || 'gpt-4o',
        ...overrides,
      });
    }

    case 'anthropic': {
      return new AnthropicProvider({
        baseUrl:
          overrides?.baseUrl ??
          Deno.env.get('ANTHROPIC_BASE_URL') ??
          'https://api.anthropic.com/v1',
        apiKey: overrides?.apiKey ?? Deno.env.get('ANTHROPIC_API_KEY'),
        model: modelName || 'claude-sonnet-4-20250514',
        ...overrides,
      });
    }

    case 'gemini': {
      return new GeminiProvider({
        baseUrl:
          overrides?.baseUrl ??
          Deno.env.get('GEMINI_BASE_URL') ??
          'https://generativelanguage.googleapis.com',
        apiKey: overrides?.apiKey ?? Deno.env.get('GEMINI_API_KEY'),
        model: modelName || 'gemini-2.5-flash',
        ...overrides,
      });
    }

    default: {
      throw new ConfigurationError(
        `Unknown provider type: "${providerType}". Expected ollama/<model>, openai/<model>, anthropic/<model>, or gemini/<model>.`,
      );
    }
  }
}
