export const DEFAULT_MAX_ITERATIONS = 15;

export const DEFAULT_CONCURRENCY = 4;

export const DEFAULT_CONTEXT_TOKEN_LIMIT = 128_000;

export const DEFAULT_STERILE_LOOP_THRESHOLD = 3;

export const DEFAULT_SUMMARY_TOKEN_THRESHOLD = 2_000;

export const DEFAULT_MAX_OUTPUT_CHARS = 100_000;

export const DEFAULT_MODEL = 'ollama/qwen2.5-coder:7b';

export const WORKSPACE_INSTRUCTION_FILES = [
  'AGENT.md',
  '.agent.md',
  'ARCHITECTURE.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

// SPEC-OC-002: Token budget & protocol
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 512;
export const DEFAULT_TOOL_PROTOCOL_MODE = 'hybrid' as const;
export const DEFAULT_HYBRID_NATIVE_TOOLS_MIN_CTX = 16384;
export const DEFAULT_COMPACT_CATALOG_MAX_TOKENS = 600;
export const DEFAULT_FALLBACK_NUM_CTX = 4096;
export const DEFAULT_MAX_TOKENS_OUT = 4096;

export const TOOL_PROTOCOL_BLOCK = `## Tool protocol
You may call tools. When you need a tool, respond with ONLY a JSON object:
{"name":"<ToolName>","arguments":{...}}
Rules:
- <ToolName> must be one of the tools listed under "## Tools".
- Do not claim you cannot read or write files; use ReadFile or WriteFile.
- Prefer relative paths under the working directory.
- If you can finish without a tool, answer in plain text without JSON tool objects.`;
