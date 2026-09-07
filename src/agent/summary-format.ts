import type { Message } from '../core/types.ts';
import type { AgentState } from './state.ts';

const COMPACTION_HEADER = `<compacted-summary>
This is an automatically generated checkpoint condensing earlier conversation context.
Treat this as established background and continue without restating it.`;

const COMPACTION_FOOTER = `</compacted-summary>`;

export interface CompactionSummary {
  primaryRequest: string;
  keyConcepts: string[];
  filesAndCode: string[];
  errorsAndFixes: string[];
  pendingJobs: string[];
  currentWork: string;
  nextStep: string;
  criticalContext: string[];
}

export function renderSummary(s: CompactionSummary): string {
  const sections: string[] = [COMPACTION_HEADER];

  sections.push(`\n## Primary Request and Intent\n- ${s.primaryRequest || '(none)'}`);

  sections.push(`\n## Key Technical Concepts\n${formatList(s.keyConcepts)}`);
  sections.push(`\n## Files and Code\n${formatList(s.filesAndCode)}`);
  sections.push(`\n## Errors and Fixes\n${formatList(s.errorsAndFixes)}`);
  sections.push(`\n## Pending Jobs\n${formatList(s.pendingJobs)}`);
  sections.push(`\n## Current Work\n${s.currentWork || '(none)'}`);
  sections.push(`\n## Next Step\n${s.nextStep || '(none)'}`);
  sections.push(`\n## Critical Context\n${formatList(s.criticalContext)}`);

  sections.push(`\n${COMPACTION_FOOTER}`);
  return sections.join('\n');
}

function formatList(items: string[]): string {
  if (items.length === 0) return '- (none)';
  return items.map((item) => `- ${item}`).join('\n');
}

export function extractSummaryFromMessages(messages: Message[]): CompactionSummary {
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const toolResults: Array<{ name?: string; content: string; error?: string }> = [];
  const assistantContent: string[] = [];
  let firstUserMessage = '';

  for (const msg of messages) {
    switch (msg.role) {
      case 'user':
        if (!firstUserMessage && msg.content.trim().length > 0) {
          firstUserMessage = msg.content;
        }
        break;
      case 'assistant':
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            toolCalls.push({ name: tc.name, args: tc.args });
          }
        }
        if (msg.content && msg.content.trim().length > 0) {
          assistantContent.push(msg.content);
        }
        break;
      case 'tool':
        toolResults.push({
          name: msg.name,
          content: msg.content,
          error: msg.content.toLowerCase().includes('error') ? msg.content : undefined,
        });
        break;
    }
  }

  const files = extractFilesFromToolCalls(toolCalls);
  const concepts = extractConcepts(toolCalls);
  const errors = extractErrorsFromResults(toolResults);
  const currentWork = assistantContent.length > 0
    ? truncate(assistantContent[assistantContent.length - 1], 200)
    : '';

  return {
    primaryRequest: truncate(firstUserMessage, 500),
    keyConcepts: concepts,
    filesAndCode: files,
    errorsAndFixes: errors,
    pendingJobs: extractPendingFromToolCalls(toolCalls),
    currentWork,
    nextStep: '(resume from current work)',
    criticalContext: [],
  };
}

export function extractSummaryFromState(
  state: AgentState,
  _messages?: Message[],
): CompactionSummary {
  const pendingPlan = state.plan
    .filter((s) => s.status !== 'done' && s.status !== 'skipped')
    .map((s) => `${s.id}: ${s.description}`);

  const files = state.artifacts.map((a) => {
    const purpose = a.source === 'write' ? 'created/modified' : 'preexisting';
    return `${a.path} (${purpose})`;
  });

  const recentErrors = state.openErrors.map((e) => truncate(e, 150));

  const currentWork = state.lastAction
    ? `tool=${state.lastAction.tool} ok=${state.lastAction.ok} args=${truncate(state.lastAction.argsSummary, 100)}`
    : '';

  let nextStep = '(none)';
  const nextPlanStep = state.plan.find((s) => s.status === 'pending');
  if (nextPlanStep) {
    nextStep = `${nextPlanStep.id}: ${nextPlanStep.description}`;
  } else if (pendingPlan.length > 0) {
    nextStep = pendingPlan[0];
  }

  const concepts = new Set<string>();
  for (const action of state.recentActions) {
    concepts.add(action.tool);
  }

  return {
    primaryRequest: truncate(state.objective, 500),
    keyConcepts: [...concepts],
    filesAndCode: files,
    errorsAndFixes: recentErrors,
    pendingJobs: pendingPlan,
    currentWork,
    nextStep,
    criticalContext: state.constraints,
  };
}

function extractFilesFromToolCalls(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
): string[] {
  const files = new Set<string>();
  for (const tc of toolCalls) {
    const path = tc.args.path ?? tc.args.paths;
    if (typeof path === 'string') {
      files.add(path);
    } else if (Array.isArray(path)) {
      for (const p of path) {
        if (typeof p === 'string') files.add(p);
      }
    }
  }
  return [...files];
}

function extractConcepts(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
): string[] {
  const concepts = new Set<string>();
  for (const tc of toolCalls) {
    switch (tc.name) {
      case 'ShellBash':
        concepts.add('shell commands');
        break;
      case 'WriteFile':
      case 'EditFile':
        concepts.add('file modification');
        break;
      case 'ReadFile':
        concepts.add('file reading');
        break;
      case 'Grep':
        concepts.add('code search');
        break;
      case 'RunTests':
        concepts.add('testing');
        break;
      case 'GitCommit':
      case 'GitDiff':
        concepts.add('git operations');
        break;
      case 'InstallDependency':
        concepts.add('dependency management');
        break;
    }
  }
  return [...concepts];
}

function extractErrorsFromResults(
  results: Array<{ name?: string; content: string; error?: string }>,
): string[] {
  const errors: string[] = [];
  for (const r of results) {
    if (r.error) {
      errors.push(truncate(r.error, 150));
    }
  }
  return errors;
}

function extractPendingFromToolCalls(
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
): string[] {
  if (toolCalls.length === 0) return [];
  const last = toolCalls[toolCalls.length - 1];
  return [`Continue from ${last.name} call`];
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 3) + '...';
}
