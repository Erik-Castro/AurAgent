import { PermissionError } from '../core/errors.ts';

export class RestrictedCommands {
  private patterns: RegExp[];

  constructor(patterns?: RegExp[]) {
    this.patterns = patterns ?? [
      /^rm\s+-rf\s+\/$/,
      /^rm\s+-rf\s+\/[\w/]+\s*$/,
      /^>\s+\/dev\/(sd|nvme|vd)/,
      /^mkfs\.\w+/,
      /^dd\s+if=/,
      /^chmod\s+777\s+\/$/,
      /^git\s+push\s+--force\s+/,
      /^curl\s+(https?:\/\/)?(10\.|192\.168\.)/,
      /^wget\s+(https?:\/\/)?(10\.|192\.168\.)/,
    ];
  }

  check(command: string): void {
    for (const pattern of this.patterns) {
      if (pattern.test(command.trim())) {
        throw new PermissionError(
          `Comando bloqueado por segurança: ${command.trim()}`,
          command.trim(),
        );
      }
    }
  }

  addPattern(pattern: RegExp): void {
    this.patterns.push(pattern);
  }
}
