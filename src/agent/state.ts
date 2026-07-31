import { StateInvariantError } from '../core/errors.ts';
import type { AgentConfig } from '../core/types.ts';

export type PlanStepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  note: string;
}

export interface ArtifactRecord {
  path: string;
  size: number;
  source: 'write' | 'preexisting' | 'unknown';
  updatedAtIteration: number;
}

export interface ActionRecord {
  iteration: number;
  tool: string;
  argsSummary: string;
  ok: boolean;
  observationSummary: string;
}

export interface AgentState {
  objective: string;
  acceptance: string[];
  plan: PlanStep[];
  artifacts: ArtifactRecord[];
  recentActions: ActionRecord[];
  lastAction: ActionRecord | null;
  openErrors: string[];
  constraints: string[];
  iteration: number;
  flags: {
    lastWriteGateFailed: boolean;
    sterileStop: boolean;
    readonly: boolean;
  };
}

export function isValidArtifactPath(path: string): boolean {
  if (path.startsWith('/')) return false;
  if (path.startsWith('./')) return false;
  if (path.split('/').includes('..')) return false;
  return true;
}

export function assertValidState(state: AgentState, config: AgentConfig): void {
  const fail = (msg: string): never => {
    throw new StateInvariantError(msg);
  };

  if (state.objective.trim().length < 1) {
    fail('state.objective deve ter comprimento >= 1');
  }
  if (state.plan.length > config.maxPlanSteps) {
    fail(`plan.length (${state.plan.length}) > maxPlanSteps (${config.maxPlanSteps})`);
  }
  if (state.recentActions.length > config.maxRecentActions) {
    fail(
      `recentActions.length (${state.recentActions.length}) > maxRecentActions (${config.maxRecentActions})`,
    );
  }
  if (state.openErrors.length > config.maxOpenErrors) {
    fail(`openErrors.length (${state.openErrors.length}) > maxOpenErrors (${config.maxOpenErrors})`);
  }
  if (state.acceptance.length > 8) {
    fail(`acceptance.length (${state.acceptance.length}) > 8`);
  }

  const seen = new Set<string>();
  for (const step of state.plan) {
    if (step.id.length < 1) fail('PlanStep.id não pode ser vazio');
    if (seen.has(step.id)) fail(`PlanStep.id duplicado: ${step.id}`);
    seen.add(step.id);
  }

  if (state.lastAction !== null && state.recentActions.length > 0) {
    const last = state.recentActions[state.recentActions.length - 1];
    if (JSON.stringify(last) !== JSON.stringify(state.lastAction)) {
      fail('lastAction deve ser deep-equal ao último elemento de recentActions');
    }
  }

  for (const artifact of state.artifacts) {
    if (!isValidArtifactPath(artifact.path)) {
      fail(`path de artifact inválido: ${artifact.path}`);
    }
    if (artifact.size < 0) fail(`size negativo no artifact: ${artifact.path}`);
  }

  if (state.flags.readonly !== (config.permissions === 'readonly')) {
    fail('flags.readonly deve refletir config.permissions');
  }
}
