import type { ProcessRunner } from '../ports/process-runner.ts';
import type { ProcessRequest, ProcessResult } from '../core/types.ts';
import { ToolExecutionError } from '../core/errors.ts';
import { RestrictedCommands } from './restricted-commands.ts';

export class DenoProcessRunner implements ProcessRunner {
  private restricted: RestrictedCommands;

  constructor(restricted?: RestrictedCommands) {
    this.restricted = restricted ?? new RestrictedCommands();
  }

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.restricted.check(request.command);

    const timeoutMs = request.timeoutMs ?? 30_000;

    const cmd = new Deno.Command('bash', {
      args: ['-c', request.command],
      cwd: request.cwd ?? Deno.cwd(),
      stdout: 'piped',
      stderr: 'piped',
      env: request.env,
    });

    const process = cmd.spawn();

    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const result = await Promise.race([
      process.output(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          process.kill('SIGTERM');
          reject(
            new ToolExecutionError(
              `Process timed out after ${timeoutMs}ms`,
              'ShellBash',
            ),
          );
        }, timeoutMs);
      }),
    ]);

    clearTimeout(timeoutId);

    if (timedOut) {
      throw new ToolExecutionError(
        `Process timed out after ${timeoutMs}ms`,
        'ShellBash',
      );
    }

    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);
    const maxChars = 100_000;

    let truncated = false;
    let outputStdout = stdout;
    if (stdout.length > maxChars) {
      outputStdout =
        stdout.slice(0, maxChars / 2) +
        '\n... [truncado] ...\n' +
        stdout.slice(-maxChars / 2);
      truncated = true;
    }
    let outputStderr = stderr;
    if (stderr.length > maxChars) {
      outputStderr =
        stderr.slice(0, maxChars / 2) +
        '\n... [truncado] ...\n' +
        stderr.slice(-maxChars / 2);
      truncated = true;
    }

    return {
      code: result.code,
      stdout: outputStdout,
      stderr: outputStderr,
      truncated,
    };
  }
}
