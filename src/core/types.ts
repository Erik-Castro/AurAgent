export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  output: string;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProcessRequest {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
  env?: Record<string, string>;
}

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

export interface GenerateRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface StreamRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}

export type ModelEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; finishReason: GenerateResponse['finishReason'] }
  | { type: 'error'; message: string };

export interface StreamDisplay {
  startIteration(n: number): void;
  onToken(text: string): void;
  onToolCall(call: ToolCall): void;
  onDone(finishReason: GenerateResponse['finishReason']): void;
  onError(message: string): void;
  flush(): void;
}

export type PermissionLevel = 'default' | 'approve-all' | 'readonly';

export type ApprovalDecision =
  | { approved: true; editedArgs?: Record<string, unknown> }
  | { approved: false; reason?: string };

export interface AgentConfig {
  maxIterations: number;
  model: string;
  workingDir: string;
  permissions: PermissionLevel;
  concurrency: number;
  contextTokenLimit: number;
  sterileLoopThreshold: number;
  summaryTokenThreshold: number;
  maxOutputChars: number;
  dryRun?: boolean;
  explain?: boolean;
  preCommitGate?: boolean;
  rulesPaths?: string[];
  display?: StreamDisplay;
}

export interface AgentState {
  iteration: number;
  config: AgentConfig;
  startTime: number;
  task: string;
}
