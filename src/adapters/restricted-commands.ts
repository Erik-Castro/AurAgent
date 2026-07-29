import { PermissionError } from '../core/errors.ts';
import { loadSecurityRules } from '../core/security-config.ts';

export class RestrictedCommands {
  private patterns: RegExp[];

  constructor(patterns?: RegExp[]) {
    this.patterns = patterns ?? loadSecurityRules();
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
