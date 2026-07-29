import type { ToolCall, ToolResult } from '../core/types.ts';
import type { ToolHandler, ToolContext } from './handler.ts';
import * as defs from './definitions.ts';

export const shellBashHandler: ToolHandler = {
  definition: defs.SHELL_BASH_DEF,
  riskLevel: 'low',
  parallelSafe: false,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const result = await ctx.processRunner.run({
      command: call.args.command as string,
      cwd: call.args.cwd as string | undefined,
      timeoutMs: call.args.timeout_ms as number | undefined,
      env: call.args.env as Record<string, string> | undefined,
    });
    const output = `Exit code: ${result.code}\n${result.stdout}`;
    const errorPart = result.stderr ? `\n\nStderr:\n${result.stderr}` : '';
    return { callId: call.id, output: output + errorPart };
  },
};

export const readFileHandler: ToolHandler = {
  definition: defs.READ_FILE_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const paths = call.args.paths as string[];
    const linesOpt = call.args.lines as { start?: number; end?: number } | undefined;

    const entries = await ctx.workspace.readMultiple(paths);

    let output: string;
    if (linesOpt) {
      const start = linesOpt.start ?? 0;
      const end = linesOpt.end;
      const filtered = entries.map((e) => {
        const contentLines = e.content.split('\n');
        const sliced = end
          ? contentLines.slice(start, end)
          : contentLines.slice(start);
        return { path: e.path, content: sliced.join('\n'), language: e.language };
      });
      output = JSON.stringify(filtered, null, 2);
    } else {
      output = JSON.stringify(entries, null, 2);
    }

    return { callId: call.id, output };
  },
};

export const writeFileHandler: ToolHandler = {
  definition: defs.WRITE_FILE_DEF,
  riskLevel: 'medium',
  parallelSafe: false,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const path = call.args.path as string;
    const content = call.args.content as string;
    const mode = (call.args.mode as string) ?? 'overwrite';

    if (mode === 'append') {
      const existing = await ctx.workspace.exists(path)
        ? await ctx.workspace.read(path)
        : '';
      await ctx.workspace.write(path, existing + content);
    } else {
      await ctx.workspace.write(path, content);
    }

    return { callId: call.id, output: `Arquivo escrito: ${path}` };
  },
};

export const findFilesHandler: ToolHandler = {
  definition: defs.FIND_FILES_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const pattern = call.args.pattern as string;
    const exclude = (call.args.exclude as string[]) ?? [];
    const maxResults = (call.args.max_results as number) ?? 200;

    let files = await ctx.workspace.list(pattern);

    if (exclude.length > 0) {
      const excludeRegexes = exclude.map(
        (p) => new RegExp(p.replace(/\*/g, '.*')),
      );
      files = files.filter(
        (f) => !excludeRegexes.some((r) => r.test(f)),
      );
    }

    files = files.slice(0, maxResults);
    return { callId: call.id, output: JSON.stringify(files, null, 2) };
  },
};

export const grepHandler: ToolHandler = {
  definition: defs.GREP_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const query = call.args.query as string;
    const pathFilter = call.args.path as string | undefined;
    const include = call.args.include as string | undefined;
    const caseSensitive = call.args.case_sensitive as boolean | undefined;
    const maxResults = (call.args.max_results as number) ?? 50;

    const flag = caseSensitive ? '' : 'i';
    const regex = new RegExp(query, flag);
    const allFiles = include
      ? await ctx.workspace.list(include)
      : await ctx.workspace.list();

    const results: Array<{
      file: string;
      line: number;
      column: number;
      content: string;
    }> = [];

    for (const file of allFiles) {
      if (pathFilter && !file.startsWith(pathFilter)) continue;
      try {
        const content = await ctx.workspace.read(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(regex);
          if (match) {
            const column = (match.index ?? 0) + 1;
            results.push({
              file,
              line: i + 1,
              column,
              content: lines[i].trim(),
            });
            if (results.length >= maxResults) break;
          }
        }
      } catch {
        // skip files that can't be read
      }
      if (results.length >= maxResults) break;
    }

    return {
      callId: call.id,
      output: JSON.stringify(results.slice(0, maxResults), null, 2),
    };
  },
};

async function detectTestFramework(
  ctx: ToolContext,
): Promise<string> {
  if (
    await ctx.workspace.exists('deno.json') ||
    await ctx.workspace.exists('deno.jsonc')
  ) {
    return 'deno';
  }
  if (
    await ctx.workspace.exists('vitest.config.ts') ||
    await ctx.workspace.exists('vitest.config.js')
  ) {
    return 'vitest';
  }
  if (
    await ctx.workspace.exists('jest.config.ts') ||
    await ctx.workspace.exists('jest.config.js') ||
    await ctx.workspace.exists('jest.config.cjs')
  ) {
    return 'jest';
  }
  if (await ctx.workspace.exists('package.json')) {
    const pkg = JSON.parse(await ctx.workspace.read('package.json'));
    if (pkg.devDependencies?.vitest) return 'vitest';
    if (pkg.devDependencies?.jest) return 'jest';
  }
  return 'deno';
}

export const runTestsHandler: ToolHandler = {
  definition: defs.RUN_TESTS_DEF,
  riskLevel: 'low',
  parallelSafe: false,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const framework =
      (call.args.framework as string | undefined) ??
      (await detectTestFramework(ctx));
    const filter = call.args.filter as string | undefined;
    const coverage = call.args.coverage as boolean | undefined;

    let cmd: string;
    if (framework === 'deno') {
      cmd = 'deno test --allow-read --allow-write --allow-env';
      if (filter) cmd += ` --filter '${filter.replace(/'/g, "'\\''")}'`;
      if (coverage) cmd += ' --coverage';
    } else if (framework === 'vitest') {
      cmd = 'npx vitest run';
      if (filter) cmd += ` --testNamePattern '${filter!.replace(/'/g, "'\\''")}'`;
      if (coverage) cmd += ' --coverage';
    } else {
      cmd = 'npx jest';
      if (filter) cmd += ` --testNamePattern '${filter!.replace(/'/g, "'\\''")}'`;
      if (coverage) cmd += ' --coverage';
    }

    const result = await ctx.processRunner.run({ command: cmd });
    return {
      callId: call.id,
      output: JSON.stringify(
        {
          passed: result.code === 0 ? 'yes' : 'no',
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
          truncated: result.truncated,
        },
        null,
        2,
      ),
    };
  },
};

export const listDepsHandler: ToolHandler = {
  definition: defs.LIST_DEPS_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const ecosystem =
      (call.args.ecosystem as string | undefined) ??
      (await detectEcosystem(ctx));

    if (ecosystem === 'deno') {
      const content = await ctx.workspace.read('deno.json')
        || await ctx.workspace.read('deno.jsonc');
      const parsed = JSON.parse(content);
      const deps = Object.entries(parsed.imports ?? {}).map(
        ([name, version]) => ({ name, version: String(version), type: 'import' }),
      );
      return { callId: call.id, output: JSON.stringify(deps, null, 2) };
    }

    const content = await ctx.workspace.read('package.json');
    const pkg = JSON.parse(content);
    const deps = [
      ...Object.entries(pkg.dependencies ?? {}).map(
        ([name, version]) => ({ name, version, type: 'prod' }),
      ),
      ...Object.entries(pkg.devDependencies ?? {}).map(
        ([name, version]) => ({ name, version, type: 'dev' }),
      ),
    ];
    return { callId: call.id, output: JSON.stringify(deps, null, 2) };
  },
};

async function detectEcosystem(ctx: ToolContext): Promise<string> {
  if (
    await ctx.workspace.exists('deno.json') ||
    await ctx.workspace.exists('deno.jsonc')
  ) {
    return 'deno';
  }
  if (await ctx.workspace.exists('package.json')) return 'npm';
  return 'npm';
}

export const installDepHandler: ToolHandler = {
  definition: defs.INSTALL_DEP_DEF,
  riskLevel: 'medium',
  parallelSafe: false,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const name = call.args.name as string;
    const version = call.args.version as string | undefined;
    const dev = call.args.dev as boolean | undefined;
    const ecosystem = await detectEcosystem(ctx);

    const pkgSpec = version ? `${name}@${version}` : name;
    let cmd: string;
    if (ecosystem === 'deno') {
      cmd = `deno add ${pkgSpec}`;
    } else if (dev) {
      cmd = `npm install --save-dev ${pkgSpec}`;
    } else {
      cmd = `npm install ${pkgSpec}`;
    }

    const result = await ctx.processRunner.run({ command: cmd });
    return {
      callId: call.id,
      output: result.code === 0
        ? `Pacote instalado: ${pkgSpec}`
        : `Erro ao instalar ${pkgSpec}:\n${result.stderr}`,
    };
  },
};

export const webSearchHandler: ToolHandler = {
  definition: defs.WEB_SEARCH_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  execute(call: ToolCall, _ctx: ToolContext): Promise<ToolResult> {
    return Promise.resolve({
      callId: call.id,
      output: '[WebSearch não configurado. Configure um provedor de busca.]',
    });
  },
};

export const webFetchHandler: ToolHandler = {
  definition: defs.WEB_FETCH_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  async execute(call: ToolCall, _ctx: ToolContext): Promise<ToolResult> {
    const url = call.args.url as string;
    try {
      const response = await fetch(url);
      const text = await response.text();
      const maxLen = 50_000;
      const output = text.length > maxLen
        ? text.slice(0, maxLen) + '\n... [truncado] ...'
        : text;
      return { callId: call.id, output };
    } catch (err) {
      return {
        callId: call.id,
        output: `Erro ao acessar ${url}: ${(err as Error).message}`,
      };
    }
  },
};

export const gitDiffHandler: ToolHandler = {
  definition: defs.GIT_DIFF_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const stagedOnly = call.args.staged_only as boolean | undefined;
    const path = call.args.path as string | undefined;

    let cmd = 'git diff';
    if (stagedOnly) cmd += ' --staged';
    if (path) cmd += ` -- '${path.replace(/'/g, "'\\''")}'`;

    const result = await ctx.processRunner.run({ command: cmd });
    return { callId: call.id, output: result.stdout || result.stderr || '(sem alterações)' };
  },
};

export const gitCommitHandler: ToolHandler = {
  definition: defs.GIT_COMMIT_DEF,
  riskLevel: 'high',
  parallelSafe: false,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const message = call.args.message as string;
    const files = call.args.files as string[] | undefined;

    if (files && files.length > 0) {
      await ctx.processRunner.run({
        command: `git add ${files.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(' ')}`,
      });
    } else {
      await ctx.processRunner.run({ command: 'git add -A' });
    }

    const escapedMsg = message.replace(/'/g, "'\\''");
    const result = await ctx.processRunner.run({
      command: `git commit -m '${escapedMsg}'`,
    });

    return {
      callId: call.id,
      output: result.code === 0
        ? `Commit realizado:\n${result.stdout}`
        : `Erro no commit:\n${result.stderr}`,
    };
  },
};

export const askUserHandler: ToolHandler = {
  definition: defs.ASK_USER_DEF,
  riskLevel: 'low',
  parallelSafe: false,
  execute(call: ToolCall, _ctx: ToolContext): Promise<ToolResult> {
    const question = call.args.question as string;
    const options = call.args.options as string[] | undefined;

    const optsText = options
      ? `\nOpções:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
      : '';

    return Promise.resolve({
      callId: call.id,
      output: `[AskUser — pendente de resposta do usuário]\nPergunta: ${question}${optsText}`,
    });
  },
};

export const ALL_HANDLERS: ToolHandler[] = [
  shellBashHandler,
  readFileHandler,
  writeFileHandler,
  findFilesHandler,
  grepHandler,
  runTestsHandler,
  listDepsHandler,
  installDepHandler,
  webSearchHandler,
  webFetchHandler,
  gitDiffHandler,
  gitCommitHandler,
  askUserHandler,
];
