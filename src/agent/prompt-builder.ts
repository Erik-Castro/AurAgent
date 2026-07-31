import type { AgentConfig, Message, ToolDefinition } from '../core/types.ts';
import { buildCompactToolCatalog } from '../tools/compact-catalog.ts';
import { estimateTokens, resolveNumCtx } from './token-budget.ts';
import { PromptBudgetExceededError } from '../core/errors.ts';
import type { AgentState } from './state.ts';

export interface PromptBuildResult {
  messages: Message[];
  tokensEst: number;
}

export interface PromptBudget {
  promptBudget: number;
  numCtx: number;
  outputReserveTokens: number;
}

export function resolvePromptBudget(
  config: AgentConfig,
  env: Record<string, string | undefined>,
  ollamaShowCtx: number | null,
): PromptBudget {
  const resolved = resolveNumCtx(config, env, ollamaShowCtx);
  return {
    promptBudget: resolved.promptBudget,
    numCtx: resolved.numCtx,
    outputReserveTokens: resolved.outputReserveTokens,
  };
}

function formatAcceptance(state: AgentState): string {
  if (state.acceptance.length === 0) return '(none)';
  return state.acceptance.map((a) => `- ${a}`).join('\n');
}

function formatPlan(state: AgentState, withNotes: boolean): string {
  if (state.plan.length === 0) return '(none)';
  return state.plan.map((s) => {
    const note = withNotes && s.note ? ` (${s.note})` : '';
    return `- [${s.status}] ${s.id}: ${s.description}${note}`;
  }).join('\n');
}

function formatArtifacts(state: AgentState, max: number): string {
  const list = state.artifacts.slice(0, max);
  if (list.length === 0) return '(none)';
  return list
    .map((a) => `- ${a.path} (size=${a.size}, ${a.source})`)
    .join('\n');
}

function formatAction(action: { tool: string; ok: boolean; argsSummary: string; observationSummary: string }, obsMax: number): string {
  const obs = action.observationSummary.length > obsMax
    ? action.observationSummary.slice(0, obsMax) + '…'
    : action.observationSummary;
  return `tool=${action.tool} ok=${action.ok} args=${action.argsSummary}\nobs=${obs}`;
}

function formatLastAction(state: AgentState, obsMax: number): string {
  if (!state.lastAction) return '(none)';
  return formatAction(state.lastAction, obsMax);
}

function formatRecentActions(state: AgentState, obsMax: number): string {
  if (state.recentActions.length === 0) return '(none)';
  return state.recentActions
    .map((a) => formatAction(a, obsMax))
    .join('\n\n');
}

function formatOpenErrors(state: AgentState, max: number): string {
  const list = state.openErrors.slice(0, max);
  if (list.length === 0) return '(none)';
  return list.map((e) => `- ${e}`).join('\n');
}

function buildSystemContent(
  state: AgentState,
  config: AgentConfig,
  toolDefinitions: ToolDefinition[],
  protocolBlock: string,
): string {
  const parts: string[] = [
    'You are Aur, an autonomous coding agent.',
    `Working directory: ${config.workingDir}`,
    protocolBlock,
    buildCompactToolCatalog(toolDefinitions, config.compactCatalogMaxTokens),
    `## Constraints\n${state.constraints.map((c) => `- ${c}`).join('\n')}`,
  ];
  return parts.join('\n\n');
}

export interface UserBuildOptions {
  includeRecentActions: boolean;
  obsSummaryMax: number;
  maxArtifacts: number;
  withNotes: boolean;
  maxOpenErrors: number;
}

const DEFAULT_USER_OPTIONS: UserBuildOptions = {
  includeRecentActions: true,
  obsSummaryMax: 800,
  maxArtifacts: Infinity,
  withNotes: true,
  maxOpenErrors: Infinity,
};

function buildUserContent(state: AgentState, opts: UserBuildOptions): string {
  const recent = opts.includeRecentActions
    ? formatRecentActions(state, opts.obsSummaryMax)
    : '';
  const recentSection = opts.includeRecentActions
    ? `\n\n## Recent actions\n${recent}`
    : '';

  return `## Objective
${state.objective}

## Acceptance
${formatAcceptance(state)}

## Plan
${formatPlan(state, opts.withNotes)}

## Workspace artifacts
${formatArtifacts(state, opts.maxArtifacts)}

## Last action
${formatLastAction(state, opts.obsSummaryMax)}${recentSection}

## Open errors
${formatOpenErrors(state, opts.maxOpenErrors)}

## Iteration
${state.iteration}

Decide the next action. If a tool is required, emit only the JSON tool object per Tool protocol. If the objective is complete, reply with a short plain-text status without tool JSON.`;
}

export function buildPromptFromState(
  state: AgentState,
  config: AgentConfig,
  toolDefinitions: ToolDefinition[],
  protocolBlock: string,
  budget: { promptBudget: number },
): PromptBuildResult {
  const system = buildSystemContent(state, config, toolDefinitions, protocolBlock);

  // Cortes em ordem (§3.5.3.4): um por vez, recalculando.
  const cuts: Array<(o: UserBuildOptions) => UserBuildOptions> = [
    (o) => ({ ...o, includeRecentActions: false }),
    (o) => ({ ...o, obsSummaryMax: 200 }),
    (o) => ({ ...o, maxArtifacts: 5 }),
    (o) => ({ ...o, withNotes: false }),
    (o) => ({ ...o, maxOpenErrors: 1 }),
  ];

  let opts: UserBuildOptions = {
    ...DEFAULT_USER_OPTIONS,
    maxArtifacts: config.maxArtifactsInPrompt,
    maxOpenErrors: config.maxOpenErrors,
  };

  for (let i = 0; i <= cuts.length; i++) {
    const user = buildUserContent(state, opts);
    const tokensEst = estimateTokens(system) + estimateTokens(user);
    if (tokensEst <= budget.promptBudget) {
      return {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tokensEst,
      };
    }
    if (i < cuts.length) {
      opts = cuts[i](opts);
    }
  }

  throw new PromptBudgetExceededError(
    `Prompt projection excede prompt_budget=${budget.promptBudget} mesmo após todos os cortes`,
  );
}
