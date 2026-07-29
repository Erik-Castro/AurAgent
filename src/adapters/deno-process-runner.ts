import type { ProcessRunner } from '../ports/process-runner.ts';
import type { ProcessRequest, ProcessResult } from '../core/types.ts';
import { ToolExecutionError } from '../core/errors.ts';
import { RestrictedCommands } from './restricted-commands.ts';

export class DenoProcessRunner implements ProcessRunner {
  private restricted: RestrictedCommands;

  constructor(
    restricted?: RestrictedCommands,
    private defaultTimeoutMs: number = 30_000,
  ) {
    this.restricted = restricted ?? new RestrictedCommands();
  }

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.restricted.check(request.command);

    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;

    const cmd = new Deno.Command('bash', {
      args: ['-c', request.command],
      cwd: request.cwd ?? Deno.cwd(),
      stdout: 'piped',
      stderr: 'piped',
      env: request.env,
    });

    const process = cmd.spawn();

    const outputPromise = process.output();
    const timeoutPromise = timeoutMs > 0
      ? new Promise<never>((_, reject) => {
          setTimeout(() => {
            try {
              process.kill('SIGTERM');
              // Give process a moment to terminate, then SIGKILL
              setTimeout(() => {
                try { process.kill('SIGKILL'); } catch { /* already dead */ }
              }, 2000);
            } catch {
              // process may already have exited
            }
            reject(
              new ToolExecutionError(
                `Process timed out after ${timeoutMs}ms`,
                'ShellBash',
              ),
            );
          }, timeoutMs);
        })
      : new Promise<never>(() => {}); // never resolves, no timeout

    let output: Deno.CommandOutput;
    try {
      output = await Promise.race([outputPromise, timeoutPromise]);
    } finally {
      // Ensure process is cleaned up even if timeout fires
      try { process.kill('SIGKILL'); } catch { /* already dead */ }
    }

    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    const maxChars = request.maxOutputChars ?? 100_000;

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
      code: output.code,
      stdout: outputStdout,
      stderr: outputStderr,
      truncated,
    };
  }
}
