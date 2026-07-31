export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
  includeThinkingInContent?: boolean;
}
