export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ToolExecutionError extends DomainError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly exitCode?: number,
  ) {
    super(message, 'TOOL_EXECUTION_ERROR');
  }
}

export class HITLRequiredError extends DomainError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly args: Record<string, unknown>,
  ) {
    super(message, 'HITL_REQUIRED');
  }
}

export class LoopLimitError extends DomainError {
  constructor(iterations: number) {
    super(
      `Loop atingiu o limite máximo de ${iterations} iterações`,
      'LOOP_LIMIT',
    );
  }
}

export class PermissionError extends DomainError {
  constructor(
    message: string,
    public readonly command: string,
  ) {
    super(message, 'PERMISSION_DENIED');
  }
}

export class SterileLoopError extends DomainError {
  constructor(
    message: string,
    public readonly repeatedAction: string,
    public readonly repeatCount: number,
  ) {
    super(message, 'STERILE_LOOP');
  }
}

export class ConfigurationError extends DomainError {
  constructor(message: string, public readonly key?: string) {
    super(message, 'CONFIGURATION_ERROR');
  }
}

export class WorkspacePathError extends DomainError {
  constructor(message: string) {
    super(message, 'WORKSPACE_PATH_ERROR');
  }
}

export class StateInvariantError extends DomainError {
  constructor(message: string) {
    super(message, 'STATE_INVARIANT');
  }
}

export class PromptBudgetExceededError extends DomainError {
  constructor(message: string) {
    super(message, 'PROMPT_BUDGET_EXCEEDED');
  }
}

export type Result<T, E = DomainError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
