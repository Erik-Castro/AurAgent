import type { ToolCall, ToolResult } from '../core/types.ts';
import type { ToolHandler, ToolContext } from './handler.ts';
import * as defs from './definitions.ts';

export const shellBashHandler: ToolHandler = {
  definition: defs.SHELL_BASH_DEF,
  riskLevel: 'low',
  parallelSafe: false,
  timeoutMs: 30_000,
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

const STREAM_THRESHOLD = 10 * 1024 * 1024; // 10 MiB
const DEFAULT_LIMIT = 2000;
const MAX_LINE_CHARS = 2000;
const MAX_OUTPUT_BYTES = 50 * 1024;

export const readFileHandler: ToolHandler = {
  definition: defs.READ_FILE_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  timeoutMs: 10_000,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const paths = call.args.paths as string[];
    const encoding = (call.args.encoding as string | undefined) ?? 'utf-8';
    const offset = Math.max(1, (call.args.offset as number | undefined) ?? 1);
    const limit = Math.min(5000, Math.max(1, (call.args.limit as number | undefined) ?? DEFAULT_LIMIT));
    const lineNumbers = (call.args.line_numbers as boolean | undefined) !== false;

    if (encoding === 'base64') {
      const entries = await Promise.all(
        paths.map(async (path) => {
          const bytes = await Deno.readFile(
            path.startsWith('/') ? path : `${ctx.config.workingDir}/${path}`,
          );
          const base64 = btoa(String.fromCharCode(...bytes));
          return { path, content: base64, language: 'base64', size: bytes.length };
        }),
      );
      return { callId: call.id, output: JSON.stringify(entries, null, 2) };
    }

    const results: string[] = [];
    for (const path of paths) {
      const fileStat = await ctx.workspace.stat(path);
      if (!fileStat || !fileStat.isFile) {
        results.push(`ERROR: File not found: ${path}`);
        continue;
      }

      let output: string;
      if (fileStat.size >= STREAM_THRESHOLD) {
        output = await readStreamWindowed(ctx, path, offset, limit, lineNumbers);
      } else {
        output = await readWholeWindowed(ctx, path, offset, limit, lineNumbers);
      }
      results.push(output);
    }

    return { callId: call.id, output: results.join('\n\n') };
  },
};

async function readWholeWindowed(
  ctx: ToolContext,
  path: string,
  offset: number,
  limit: number,
  lineNumbers: boolean,
): Promise<string> {
  const content = await ctx.workspace.read(path);
  const allLines = content.split('\n');
  const totalLines = allLines.length;
  const slice = allLines.slice(offset - 1, offset - 1 + limit);

  return formatOutput(path, slice, offset, totalLines, lineNumbers);
}

async function readStreamWindowed(
  ctx: ToolContext,
  path: string,
  offset: number,
  limit: number,
  lineNumbers: boolean,
): Promise<string> {
  let totalLines = 0;
  const collected: string[] = [];
  let bytesCollected = 0;
  let lineNum = 0;

  for await (const line of ctx.workspace.readStream(path)) {
    totalLines++;
    lineNum++;

    if (lineNum >= offset && collected.length < limit) {
      const truncated = line.length > MAX_LINE_CHARS
        ? line.slice(0, MAX_LINE_CHARS) + `... (truncated to ${MAX_LINE_CHARS} chars)`
        : line;
      const prefixed = lineNumbers ? `${lineNum}: ${truncated}` : truncated;
      bytesCollected += prefixed.length;
      if (bytesCollected > MAX_OUTPUT_BYTES) break;
      collected.push(prefixed);
    }
  }

  const endLine = Math.min(offset - 1 + collected.length, totalLines);
  const header = `${path} (lines ${offset}-${endLine} of ${totalLines})`;
  const footer = endLine < totalLines
    ? `\n(Use offset=${endLine + 1} to continue reading)`
    : '';

  return header + '\n' + collected.join('\n') + footer;
}

function formatOutput(
  path: string,
  lines: string[],
  offset: number,
  totalLines: number,
  lineNumbers: boolean,
): string {
  const prefixed = lines.map((line, i) => {
    const ln = offset + i;
    const truncated = line.length > MAX_LINE_CHARS
      ? line.slice(0, MAX_LINE_CHARS) + `... (truncated to ${MAX_LINE_CHARS} chars)`
      : line;
    return lineNumbers ? `${ln}: ${truncated}` : truncated;
  });

  const endLine = Math.min(offset - 1 + lines.length, totalLines);
  const header = `${path} (lines ${offset}-${endLine} of ${totalLines})`;
  const footer = endLine < totalLines
    ? `\n(Use offset=${endLine + 1} to continue reading)`
    : '';

  return header + '\n' + prefixed.join('\n') + footer;
}

export const writeFileHandler: ToolHandler = {
  definition: defs.WRITE_FILE_DEF,
  riskLevel: 'medium',
  parallelSafe: false,
  timeoutMs: 5_000,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const path = call.args.path as string;
    if (typeof path !== 'string' || path === '') {
      return { callId: call.id, output: 'Erro: path obrigatório' };
    }

    const content = call.args.content as string;
    if (typeof content !== 'string') {
      return { callId: call.id, output: 'Erro: content deve ser string' };
    }

    const mode = (call.args.mode as string) ?? 'overwrite';
    const validModes = new Set(['create', 'overwrite', 'append']);
    if (!validModes.has(mode)) {
      return { callId: call.id, output: `Erro: mode inválido "${mode}". Valores: create | overwrite | append` };
    }

    if (mode === 'create') {
      if (await ctx.workspace.exists(path)) {
        return { callId: call.id, output: `Erro: Arquivo já existe: ${path}` };
      }
      await ctx.workspace.write(path, content);
      return { callId: call.id, output: `Arquivo escrito: ${path}` };
    }

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

export const editFileHandler: ToolHandler = {
  definition: defs.EDIT_FILE_DEF,
  riskLevel: 'medium',
  parallelSafe: false,
  timeoutMs: 10_000,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const path = call.args.path as string;
    if (!path) {
      return { callId: call.id, output: 'Error: path is required', error: 'path required' };
    }

    const oldString = call.args.old_string as string;
    const newString = call.args.new_string as string;
    const replaceAll = (call.args.replace_all as boolean) ?? false;

    if (typeof oldString !== 'string' || oldString === '') {
      return { callId: call.id, output: 'Error: old_string is required and must not be empty', error: 'old_string empty' };
    }
    if (typeof newString !== 'string') {
      return { callId: call.id, output: 'Error: new_string is required', error: 'new_string required' };
    }
    if (oldString === newString) {
      return { callId: call.id, output: 'Error: old_string and new_string are identical — no change to make', error: 'no change' };
    }

    // Read entire file (edit requires full buffer)
    const exists = await ctx.workspace.exists(path);
    if (!exists) {
      return { callId: call.id, output: `Error: file not found: ${path}`, error: 'not found' };
    }

    const content = await ctx.workspace.read(path);

    // Count occurrences
    const occurrences = content.split(oldString).length - 1;
    if (occurrences === 0) {
      return {
        callId: call.id,
        output: `Error: old_string not found in ${path}. The file may have changed since your last read — re-read it and try again.`,
        error: 'not found',
      };
    }
    if (occurrences > 1 && !replaceAll) {
      return {
        callId: call.id,
        output: `Error: old_string occurs ${occurrences} times in ${path}. Use replace_all=true or provide more context to make the match unique.`,
        error: 'ambiguous',
      };
    }

    // Find line number for context
    const beforeMatch = content.indexOf(oldString);
    const lineNum = content.substring(0, beforeMatch).split('\n').length;

    // Apply edit
    const newContent = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    await ctx.workspace.write(path, newContent);

    const linesReplaced = oldString.split('\n').length;
    const linesAdded = newString.split('\n').length;

    return {
      callId: call.id,
      output: `Edited ${path}: line ${lineNum} (${linesReplaced} → ${linesAdded} lines, ${occurrences} occurrence${occurrences > 1 ? 's' : ''} replaced)`,
    };
  },
};

export const findFilesHandler: ToolHandler = {
  definition: defs.FIND_FILES_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  timeoutMs: 10_000,
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
  timeoutMs: 30_000,
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
        const fileStat = await ctx.workspace.stat(file);
        if (!fileStat || !fileStat.isFile) continue;

        let lineNum = 0;
        for await (const line of ctx.workspace.readStream(file)) {
          lineNum++;
          const match = line.match(regex);
          if (match) {
            results.push({
              file,
              line: lineNum,
              column: (match.index ?? 0) + 1,
              content: line.trim().slice(0, 300),
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
  timeoutMs: 120_000,
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
  timeoutMs: 5_000,
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const ecosystem =
      (call.args.ecosystem as string | undefined) ??
      (await detectEcosystem(ctx));

    if (ecosystem === 'deno') {
      let content: string | null = null;
      try {
        content = await ctx.workspace.read('deno.json')
          || await ctx.workspace.read('deno.jsonc');
      } catch {
        // files may not exist
      }
      if (!content) {
        return {
          callId: call.id,
          output: JSON.stringify({ error: 'deno.json ou deno.jsonc não encontrado' }, null, 2),
        };
      }
      const parsed = JSON.parse(content);
      const deps = Object.entries(parsed.imports ?? {}).map(
        ([name, version]) => ({ name, version: String(version), type: 'import' }),
      );
      return { callId: call.id, output: JSON.stringify(deps, null, 2) };
    }

    try {
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
    } catch {
      return {
        callId: call.id,
        output: JSON.stringify({ error: 'package.json não encontrado ou inválido' }, null, 2),
      };
    }
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
  timeoutMs: 60_000,
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

export interface DuckDuckGoSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export function parseDuckDuckGoHtml(html: string): DuckDuckGoSearchResult[] {
  const results: DuckDuckGoSearchResult[] = [];
  const titleRegex =
    /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g;
  const hrefRegex = /href="([^"]*)"/;
  const snippetRegex =
    /<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g;
  const titles: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];

  let titleMatch: RegExpExecArray | null;
  while ((titleMatch = titleRegex.exec(html)) !== null) {
    const fullTag = titleMatch[0];
    const hrefMatch = fullTag.match(hrefRegex);
    const rawUrl = hrefMatch ? hrefMatch[1] : '';
    const url = rawUrl.includes('uddg=')
      ? decodeURIComponent(rawUrl.match(/uddg=([^&]*)/)?.[1] ?? rawUrl)
      : rawUrl;
    const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
    titles.push({ url, title });
  }

  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(snippetMatch[1].replace(/<[^>]*>/g, '').trim());
  }

  for (let i = 0; i < titles.length; i++) {
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      snippet: snippets[i] ?? '',
    });
  }

  return results;
}

export const webSearchHandler: ToolHandler = {
  definition: defs.WEB_SEARCH_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  timeoutMs: 15_000,
  async execute(call: ToolCall, _ctx: ToolContext): Promise<ToolResult> {
    const query = call.args.query as string;
    const maxResults = (call.args.max_results as number | undefined) ?? 3;

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        return {
          callId: call.id,
          output: `[WebSearch] Erro HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const html = await response.text();
      const results = parseDuckDuckGoHtml(html).slice(0, maxResults);

      if (results.length === 0) {
        return {
          callId: call.id,
          output: `[WebSearch] Nenhum resultado encontrado para: ${query}`,
        };
      }

      const output = results
        .map(
          (r, i) =>
            `Result ${i + 1}: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`,
        )
        .join('\n---\n');

      return { callId: call.id, output };
    } catch (err) {
      return {
        callId: call.id,
        output: `[WebSearch] Erro na busca: ${(err as Error).message}`,
      };
    }
  },
};

export const webFetchHandler: ToolHandler = {
  definition: defs.WEB_FETCH_DEF,
  riskLevel: 'low',
  parallelSafe: true,
  timeoutMs: 15_000,
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
  timeoutMs: 10_000,
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
  timeoutMs: 10_000,
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
  async execute(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
    const question = call.args.question as string;
    const options = call.args.options as string[] | undefined;

    let promptText = question;
    if (options && options.length > 0) {
      promptText += `\nOpções:\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    }

    const answer = await ctx.readInput(promptText);
    return { callId: call.id, output: answer };
  },
};

export const ALL_HANDLERS: ToolHandler[] = [
  shellBashHandler,
  readFileHandler,
  writeFileHandler,
  editFileHandler,
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
