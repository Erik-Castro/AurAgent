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
