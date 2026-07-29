import { DEFAULT_MODEL } from './src/core/constants.ts';
import type { AgentConfig, PermissionLevel } from './src/core/types.ts';
import { loadSecurityRules } from './src/core/security-config.ts';
import { Agent } from './src/agent/agent.ts';
import { TuiEngine } from './src/tui/mod.ts';
import {
  buildAgentContext,
  runAgent,
  FileWatcher,
  clearScreen,
  printHeader,
  printChange,
  printRunStart,
  printDone,
  printShutdown,
} from './src/watch/mod.ts';
import type { RunnerOptions } from './src/watch/mod.ts';

const config: AgentConfig = {
  maxIterations: 15,
  model: DEFAULT_MODEL,
  workingDir: Deno.cwd(),
  permissions: 'default',
  concurrency: 4,
  contextTokenLimit: 128_000,
  sterileLoopThreshold: 3,
  summaryTokenThreshold: 2_000,
  maxOutputChars: 100_000,
  preCommitGate: true,
};

function parseFlags(): {
  permissions: PermissionLevel;
  dryRun: boolean;
  explain: boolean;
  tui: boolean;
  rulesPaths: string[];
  securityConfigPath: string | undefined;
  isWatch: boolean;
  task: string;
} {
  let permissions: PermissionLevel = 'default';
  let dryRun = false;
  let explain = false;
  let tui = false;
  let isWatch = false;
  const rulesPaths: string[] = [];
  let securityConfigPath: string | undefined;
  const taskArgs: string[] = [];

  const args = Deno.args;
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--approve-all':
        permissions = 'approve-all';
        break;
      case '--readonly':
        permissions = 'readonly';
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--explain':
        explain = true;
        break;
      case '--tui':
        tui = true;
        break;
      case '--rules':
        if (i + 1 < args.length) rulesPaths.push(args[++i]);
        break;
      case '--security-config':
        if (i + 1 < args.length) securityConfigPath = args[++i];
        break;
      case 'watch':
        isWatch = true;
        break;
      default:
        taskArgs.push(args[i]);
    }
  }

  return {
    permissions,
    dryRun,
    explain,
    tui,
    rulesPaths,
    securityConfigPath,
    isWatch,
    task: taskArgs.join(' '),
  };
}

function buildRunnerOpts(
  flags: ReturnType<typeof parseFlags>,
  securityPatterns: RegExp[],
): RunnerOptions {
  return {
    config,
    permissions: flags.permissions,
    dryRun: flags.dryRun,
    explain: flags.explain,
    rulesPaths: flags.rulesPaths,
    securityPatterns,
    modelOverride: Deno.env.get('AUR_MODEL') ?? undefined,
  };
}

async function runOnce(flags: ReturnType<typeof parseFlags>): Promise<void> {
  const securityPatterns = loadSecurityRules(flags.securityConfigPath);
  const opts = buildRunnerOpts(flags, securityPatterns);
  const ctx = buildAgentContext(opts);

  let tui: TuiEngine | undefined;

  if (flags.tui) {
    tui = new TuiEngine({
      task: flags.task,
      model: ctx.config.model,
      maxIterations: ctx.config.maxIterations,
    });
    ctx.config.display = tui.stream;
    tui.start(ctx.eventBus);
  }

  try {
    const agent = new Agent(ctx);
    const result = await agent.run(flags.task);

    if (!flags.tui) {
      console.log(`\nStatus: ${result.status}`);
      console.log(`Iterações: ${result.iterations}`);
      console.log(`Duração: ${result.durationMs}ms`);
      if (result.output) {
        console.log(`\n${result.output}`);
      }
    }

    if (result.status === 'error') Deno.exit(1);
  } finally {
    tui?.stop();
  }
}

async function runWatch(flags: ReturnType<typeof parseFlags>): Promise<void> {
  const securityPatterns = loadSecurityRules(flags.securityConfigPath);
  const opts = buildRunnerOpts(flags, securityPatterns);
  const task = flags.task || 'corrija erros de lint e testes';

  clearScreen();
  printHeader();

  const watcher = new FileWatcher(async () => {
    printChange('arquivo(s) modificado(s)');
    printRunStart(task);

    try {
      await runAgent(task, opts);
    } catch (err) {
      console.error(`\n  Erro: ${(err as Error).message}`);
    }

    printDone();
  });

  await watcher.start(config.workingDir);
  printShutdown();
}

if (import.meta.main) {
  const flags = parseFlags();

  if (!flags.task && !flags.isWatch) {
    console.error(
      'Uso: aur [--approve-all] [--readonly] [--dry-run] [--explain] [--tui] [--rules path] [--security-config path] "sua tarefa"',
    );
    console.error('  ou: aur watch [flags] ["tarefa"]');
    Deno.exit(1);
  }

  if (flags.isWatch) {
    await runWatch(flags);
  } else {
    await runOnce(flags);
  }
}
