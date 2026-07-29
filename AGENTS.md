# AurAgent — AGENTS.md

Autonomous coding agent (GenAI Teammate). Built on Deno 2.x + TypeScript. Hexagonal architecture (Ports & Adapters) with event-driven ReAct loop.

## Commands

| Command | What |
|---|---|
| `deno task dev` | Run agent (full permissions) |
| `deno task eval` | Run eval suite against scenarios in `eval/scenarios/` |
| `deno task test` | Run tests (excludes `eval/`; needs `--allow-read --allow-write --allow-env`) |
| `deno task lint` | Deno lint (includes `no-explicit-any`) |
| `deno task check` | Type-check all `**/*.ts` |
| `deno task compile` | Produce single binary via `deno compile` |

Single test: `deno test --allow-read --allow-write --allow-env tests/agent/memory_test.ts`

## Key Architecture

- **`src/ports/`** — contracts: `Workspace`, `ProcessRunner`, `ModelProvider`, `MemoryStore`, `EventBus`
- **`src/adapters/`** — Deno implementations: `DenoWorkspace`, `DenoProcessRunner`, `DenoKVStore`, plus LLM providers (Ollama/OpenAI/Anthropic/Gemini)
- **`src/core/`** — types, constants, errors, tool registry, security config
- **`src/agent/`** — `Agent` (entrypoint), ReAct loop, `WorkingMemory`, checkpoint, HITL manager, sterile loop detector, summarizer
- **`src/tools/`** — 13 tool definitions + implementations, all registered in `ToolRegistry`
- **`src/tui/`** — TUI engine for interactive mode (`--tui`)
- **`src/watch/`** — file-watcher mode (`aur watch`), re-runs agent on file changes
- **`eval/`** — benchmarking suite with scenarios (`fix-simple-bug`, `refactor-module`, `dep-upgrade`)

## Model

- **Default**: `ollama/qwen2.5-coder:7b`
- **Override**: `AUR_MODEL` env var or `--model` flag on eval
- Provider auto-detected from model prefix via `src/adapters/providers/factory.ts`

## Conventions

- **Tests**: Deno built-in test runner, files named `*_test.ts` in `tests/`. Import from `@std/assert`. Entrypoint is `tests/mod.ts` (imports all test files).
- **Format**: `deno fmt` with `singleQuote: true`, `lineWidth: 100`, `indentWidth: 2`
- **Lint**: `deno lint` with `no-explicit-any` rule
- **Errors**: Custom `DomainError` hierarchy with `Result<T, E>` union type (`{ ok: true, value: T } | { ok: false, error: E }`)
- **Mock workspace**: `tests/mock-workspace.ts` (`MemoryWorkspace`) for tests that need workspace access

## Security

- Restricted command patterns loaded from `~/.aur/security.json` (auto-created with defaults if missing)
- Three permission levels: `default` (HITL on medium/high risk), `approve-all`, `readonly`
- Pre-commit gate: `deno lint` + `deno check` on every WriteFile (reverts file on failure)
- Dry-run mode via `--dry-run`: skips execution of non-low-risk tools

## Important Quirks

- Test runner excludes `eval/` (configured in `deno.jsonc` `test.exclude`)
- `WebSearch` handler is a stub — returns "not configured" message
- Running the agent requires explicit Deno permission flags: `--allow-run --allow-read --allow-write --allow-net --allow-env`
- Instruction files are auto-loaded if present: `AGENT.md`, `.agent.md`, `ARCHITECTURE.md`, `.cursorrules`, `.github/copilot-instructions.md`
