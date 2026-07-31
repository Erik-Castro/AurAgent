import type { AgentConfig, ToolCall } from '../core/types.ts';
import type { Workspace } from '../ports/workspace.ts';
import {
  assertValidState,
  isValidArtifactPath,
  type ActionRecord,
  type AgentState,
  type ArtifactRecord,
  type PlanStep,
  type PlanStepStatus,
} from './state.ts';

export interface ToolExecResult {
  callId: string;
  output: string;
  toolName: string;
}

const ACCEPTANCE_MAX = 8;

function lower(task: string): string {
  return task.toLowerCase();
}

export function deriveAcceptance(task: string): string[] {
  const items: string[] = [];
  const t = lower(task);

  if (t.includes('helloworld') || t.includes('hello world')) {
    items.push('Create or update a file whose content implements hello world behavior');
  }
  if (t.includes('.js') || t.includes('javascript')) {
    items.push('Target involves a JavaScript file');
  }
  if (t.includes('writefile') || (t.includes('write') && t.includes('file'))) {
    items.push('A write tool must be used successfully if files need changing');
  }
  if (t.includes('websearch') || t.includes('search')) {
    items.push('WebSearch must be invoked if information is requested from the web');
  }
  items.push('Do not use paths outside the workspace');

  return items.slice(0, ACCEPTANCE_MAX);
}

function hasP1(task: string): boolean {
  const t = lower(task);
  return t.includes('.js') || t.includes('javascript') || t.includes('helloworld') ||
    t.includes('hello world');
}

function hasP2(task: string): boolean {
  const t = lower(task);
  return t.includes('websearch') || t.includes('search');
}

export function deriveInitialPlan(task: string): PlanStep[] {
  if (hasP1(task)) {
    return [
      { id: 'inspect', description: 'Inspect workspace for target file', status: 'pending', note: '' },
      { id: 'write', description: 'Write or update the target file', status: 'pending', note: '' },
      { id: 'verify', description: 'Verify file exists with expected content', status: 'pending', note: '' },
    ];
  }
  if (hasP2(task)) {
    return [
      { id: 'search', description: 'Search with WebSearch', status: 'pending', note: '' },
      { id: 'answer', description: 'Answer using search results', status: 'pending', note: '' },
    ];
  }
  return [
    { id: 'act', description: 'Perform the user task', status: 'pending', note: '' },
    { id: 'verify', description: 'Verify task outcome', status: 'pending', note: '' },
  ];
}

export function buildConstraints(config: AgentConfig): string[] {
  const constraints: string[] = [];
  constraints.push('Use only tool names listed under ## Tools');
  constraints.push('Use relative paths under the working directory; never .. or absolute paths outside workspace');
  if (config.permissions === 'readonly') {
    constraints.push(
      'READONLY mode: do not call WriteFile, ShellBash that mutates, InstallDependency, GitCommit',
    );
  }
  if (config.permissions === 'default') {
    constraints.push('High/medium risk tools require human approval');
  }
  constraints.push('Keep the Objective unchanged; do not replace it with a different goal');
  return constraints;
}

const JS_FILENAME_RE = /([a-zA-Z0-9._-]+\.js)/;

function mentionsInTask(task: string, path: string): boolean {
  const filename = path.split('/').pop() ?? '';
  if (filename === '' || filename === path) return false;
  return task.includes(filename);
}

function filterWorkspaceIndex(
  task: string,
  workspaceIndex: ArtifactRecord[],
  max: number,
): ArtifactRecord[] {
  const valid = workspaceIndex.filter((a) => isValidArtifactPath(a.path));
  if (valid.length <= max) return valid;
  const mentioned = valid.filter((a) => mentionsInTask(task, a.path));
  const rest = valid.filter((a) => !mentionsInTask(task, a.path));
  return [...mentioned, ...rest].slice(0, max);
}

export function createInitialState(
  task: string,
  config: AgentConfig,
  workspaceIndex: ArtifactRecord[],
): AgentState {
  const objective = task.trim();
  if (objective.length < 1) {
    throw new Error('task vazia: objective deve ter comprimento >= 1');
  }

  const state: AgentState = {
    objective,
    acceptance: deriveAcceptance(task),
    plan: deriveInitialPlan(task),
    artifacts: filterWorkspaceIndex(task, workspaceIndex, config.maxArtifactsInPrompt),
    recentActions: [],
    lastAction: null,
    openErrors: [],
    constraints: buildConstraints(config),
    iteration: 0,
    flags: {
      lastWriteGateFailed: false,
      sterileStop: false,
      readonly: config.permissions === 'readonly',
    },
  };

  assertValidState(state, config);
  return state;
}

// ---------------------------------------------------------------------------
// Redação de argsSummary (§3.2.3)
// ---------------------------------------------------------------------------

function redactValue(value: unknown, limit: number): unknown {
  if (typeof value !== 'string' || value.length <= limit) return value;
  return value.slice(0, limit) + '…(len=' + value.length + ')';
}

export function redactArgsSummary(args: Record<string, unknown>): string {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === 'content') {
      redacted[key] = redactValue(value, 80);
    } else if (key === 'command') {
      redacted[key] = redactValue(value, 120);
    } else {
      redacted[key] = value;
    }
  }
  let json = JSON.stringify(redacted);
  if (json.length > 500) {
    json = json.slice(0, 500) + '…';
  }
  return json;
}

// ---------------------------------------------------------------------------
// Observations (§3.4.1)
// ---------------------------------------------------------------------------

const FAILURE_PREFIXES = [
  'Erro:',
  'Erro na execução:',
  'Validação pós-escrita falhou',
  'Ação rejeitada pelo usuário',
  'Path fora do workspace',
];

export function isFailureObservation(output: string): boolean {
  return FAILURE_PREFIXES.some((prefix) => output.startsWith(prefix));
}

export function summarizeObservation(output: string): string {
  if (output.length <= 800) return output;
  return output.slice(0, 800) + '…';
}

function findStep(state: AgentState, id: string): PlanStep | undefined {
  return state.plan.find((s) => s.id === id);
}

function updateStep(
  state: AgentState,
  id: string,
  status: PlanStepStatus,
  note?: string,
): AgentState {
  const step = findStep(state, id);
  if (!step) return state;
  return {
    ...state,
    plan: state.plan.map((s) =>
      s.id === id ? { ...s, status, note: note ?? s.note } : s
    ),
  };
}

function pushOpenError(state: AgentState, message: string, config: AgentConfig): AgentState {
  const trimmed = message.slice(0, 400);
  const next = { ...state, openErrors: [...state.openErrors, trimmed] };
  while (next.openErrors.length > config.maxOpenErrors) {
    next.openErrors.shift();
  }
  return next;
}

function clearGateErrors(state: AgentState): AgentState {
  const filtered = state.openErrors.filter(
    (e) => !e.includes('Validação pós-escrita') && !e.includes('Unexpected'),
  );
  return { ...state, openErrors: filtered };
}

function upsertArtifact(
  state: AgentState,
  path: string,
  size: number,
): AgentState {
  const existing = state.artifacts.find((a) => a.path === path);
  const record: ArtifactRecord = {
    path,
    size,
    source: 'write',
    updatedAtIteration: state.iteration,
  };
  const artifacts = existing
    ? state.artifacts.map((a) => (a.path === path ? record : a))
    : [...state.artifacts, record];
  return { ...state, artifacts };
}

function pushAction(
  state: AgentState,
  action: ActionRecord,
  config: AgentConfig,
): AgentState {
  const recentActions = [...state.recentActions, action];
  while (recentActions.length > config.maxRecentActions) {
    recentActions.shift();
  }
  return { ...state, recentActions, lastAction: action };
}

// ---------------------------------------------------------------------------
// applyToolResults (§3.4.1 / §3.4.2)
// ---------------------------------------------------------------------------

export async function applyToolResults(
  state: AgentState,
  calls: ToolCall[],
  results: ToolExecResult[],
  workspace: Workspace,
  config: AgentConfig,
): Promise<AgentState> {
  let next = state;
  const byCallId = new Map(calls.map((c) => [c.id, c]));

  for (const result of results) {
    const call = byCallId.get(result.callId);
    const args = call?.args ?? {};
    const ok = !isFailureObservation(result.output);

    const action: ActionRecord = {
      iteration: next.iteration,
      tool: result.toolName,
      argsSummary: redactArgsSummary(args),
      ok,
      observationSummary: summarizeObservation(result.output),
    };
    next = pushAction(next, action, config);

    if (result.output.startsWith('Arquivo escrito:')) {
      const path = result.output.slice('Arquivo escrito:'.length).trim();
      if (isValidArtifactPath(path)) {
        let size = 0;
        try {
          if (await workspace.exists(path)) {
            size = (await workspace.read(path)).length;
          }
        } catch {
          size = 0;
        }
        next = upsertArtifact(next, path, size);
        next = { ...next, flags: { ...next.flags, lastWriteGateFailed: false } };
        next = clearGateErrors(next);
        const writeStep = findStep(next, 'write');
        if (writeStep && (writeStep.status === 'in_progress' || writeStep.status === 'pending')) {
          next = updateStep(next, 'write', 'done');
        }
      }
    } else if (result.output.startsWith('Validação pós-escrita falhou')) {
      next = { ...next, flags: { ...next.flags, lastWriteGateFailed: true } };
      next = pushOpenError(next, result.output, config);
      next = updateStep(next, 'write', 'failed', summarizeObservation(result.output));
    } else if (result.toolName === 'WebSearch') {
      next = updateStep(next, 'search', ok ? 'done' : 'failed');
    } else if (result.output.startsWith('Ação rejeitada pelo usuário')) {
      next = pushOpenError(next, result.output, config);
    }
  }

  assertValidState(next, config);
  return next;
}

// ---------------------------------------------------------------------------
// applyAssistantFinal (§3.4.3)
// ---------------------------------------------------------------------------

export function applyAssistantFinal(
  state: AgentState,
  content: string,
  config: AgentConfig,
): AgentState {
  let next = state;
  if (content.trim().length > 0) {
    const target = findStep(next, 'answer') ?? findStep(next, 'verify');
    if (target && target.status === 'pending') {
      const hasFileAcceptance = next.acceptance.some((a) =>
        a.toLowerCase().includes('file') || a.toLowerCase().includes('javascript')
      );
      let fileOk = true;
      if (hasFileAcceptance) {
        const path = inferTargetPath(next);
        if (path) {
          const artifact = next.artifacts.find((a) => a.path === path);
          fileOk = !!artifact && artifact.size > 0;
        } else {
          fileOk = false;
        }
      }
      if (next.flags.lastWriteGateFailed === false && fileOk) {
        next = updateStep(next, target.id, 'done');
      }
    }
  }
  assertValidState(next, config);
  return next;
}

function inferTargetPath(state: AgentState): string | null {
  const match = state.objective.match(JS_FILENAME_RE);
  if (match) return match[1];
  const written = state.artifacts.filter((a) => a.source === 'write');
  if (written.length === 1) return written[0].path;
  return null;
}

// ---------------------------------------------------------------------------
// markPlan
// ---------------------------------------------------------------------------

export function markPlan(
  state: AgentState,
  config: AgentConfig,
  stepId: string,
  status: PlanStepStatus,
  note?: string,
): AgentState {
  const next = updateStep(state, stepId, status, note);
  assertValidState(next, config);
  return next;
}
