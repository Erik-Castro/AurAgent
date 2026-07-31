import { Agent } from '../src/agent/agent.ts';
import type { AgentConfig } from '../src/core/mod.ts';
import type { AgentContext } from '../src/agent/agent-context.ts';
import { DenoWorkspace } from '../src/adapters/deno-workspace.ts';
import { DenoProcessRunner } from '../src/adapters/deno-process-runner.ts';
import { InMemoryEventBus } from '../src/adapters/event-bus.ts';
import { DenoKVStore } from '../src/adapters/deno-kv-store.ts';
import { RestrictedCommands } from '../src/adapters/restricted-commands.ts';
import { createModelProvider } from '../src/adapters/providers/factory.ts';
import { buildToolRegistry } from '../src/tools/register.ts';

import type { Scenario, ScenarioResult } from './types.ts';
import { loadScenario } from './types.ts';

export interface EvalOptions {
  model: string;
  scenarioDir: string;
  concurrency?: number;
}

export async function runEvalSuite(
  opts: EvalOptions,
): Promise<ScenarioResult[]> {
  const entries: { id: string; dir: string }[] = [];
  for (const entry of Deno.readDirSync(opts.scenarioDir)) {
    if (entry.isDirectory) {
      const scenarioPath = `${opts.scenarioDir}/${entry.name}/scenario.json`;
      try {
        Deno.statSync(scenarioPath);
        entries.push({ id: entry.name, dir: `${opts.scenarioDir}/${entry.name}` });
      } catch {
        // not a valid scenario directory
      }
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const results: ScenarioResult[] = [];
  for (const entry of entries) {
    const scenario = loadScenario(`${entry.dir}/scenario.json`);
    const result = await runScenario(scenario, entry.dir, opts.model);
    results.push(result);
  }

  return results;
}

async function runScenario(
  scenario: Scenario,
  scenarioDir: string,
  model: string,
): Promise<ScenarioResult> {
  const errors: string[] = [];
  let testPassed = false;
  let patchMatched = false;
  let filesExist = false;
  let contentMatched = false;

  const tmpDir = await Deno.makeTempDir({ prefix: 'aur-eval-' });
  const workspaceDir = `${scenarioDir}/workspace`;

  try {
    await copyDir(workspaceDir, tmpDir);

    const agentConfig: AgentConfig = {
      maxIterations: scenario.maxIterations,
      model,
      workingDir: tmpDir,
      permissions: 'approve-all',
      concurrency: 4,
      contextTokenLimit: 128_000,
      sterileLoopThreshold: 3,
      summaryTokenThreshold: 2_000,
      maxOutputChars: 100_000,
      preCommitGate: false,
      numCtx: null,
      outputReserveTokens: 512,
      toolProtocolMode: 'hybrid',
      hybridNativeToolsMinCtx: 16384,
      compactCatalogMaxTokens: 600,
    };

    const ctx = buildEvalContext(agentConfig);
    const agent = new Agent(ctx);
    const agentResult = await agent.run(scenario.task);

    if (scenario.checkTest) {
      testPassed = await runTests(tmpDir);
      if (!testPassed) errors.push('testes falharam');
    }

    if (scenario.checkPatch) {
      patchMatched = checkPatch(scenarioDir, tmpDir);
      if (!patchMatched) errors.push('patch não corresponde');
    }

    if (scenario.checkFiles && scenario.checkFiles.length > 0) {
      filesExist = checkFilesExist(tmpDir, scenario.checkFiles);
      if (!filesExist) errors.push('arquivos esperados não encontrados');
    }

    if (scenario.checkContent) {
      contentMatched = checkFileContent(tmpDir, scenario.checkContent);
      if (!contentMatched) errors.push('conteúdo esperado não encontrado');
    }

    const isPassed = scenario.expectedStatus === agentResult.status &&
      (!scenario.checkTest || testPassed) &&
      (!scenario.checkFiles || filesExist) &&
      (!scenario.checkContent || contentMatched);

    return {
      scenarioId: scenario.id,
      status: isPassed ? 'passed' : 'failed',
      agentStatus: agentResult.status,
      output: agentResult.output.slice(0, 500),
      iterations: agentResult.iterations,
      durationMs: agentResult.durationMs,
      testPassed,
      patchMatched,
      filesExist,
      contentMatched,
      errors,
    };
  } catch (err) {
    return {
      scenarioId: scenario.id,
      status: 'error',
      agentStatus: 'error',
      output: (err as Error).message,
      iterations: 0,
      durationMs: 0,
      testPassed: false,
      patchMatched: false,
      filesExist: false,
      contentMatched: false,
      errors: [(err as Error).message],
    };
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
}

function buildEvalContext(config: AgentConfig): AgentContext {
  return {
    workspace: new DenoWorkspace(config.workingDir),
    processRunner: new DenoProcessRunner(new RestrictedCommands([])),
    modelProvider: createModelProvider(config.model),
    eventBus: new InMemoryEventBus(),
    memoryStore: new DenoKVStore(),
    toolHandlers: buildToolRegistry().handlers,
    config,
    readInput: () => Promise.resolve(''),
  };
}

async function runTests(workspaceDir: string): Promise<boolean> {
  const cmd = new Deno.Command('deno', {
    args: ['test', '--allow-read', '--allow-write', '--allow-env'],
    cwd: workspaceDir,
    stdout: 'null',
    stderr: 'null',
  });

  const result = await cmd.output();
  return result.code === 0;
}

function checkPatch(
  _scenarioDir: string,
  _workspaceDir: string,
): boolean {
  return true;
}

function checkFilesExist(
  workspaceDir: string,
  files: string[],
): boolean {
  for (const f of files) {
    try {
      Deno.statSync(`${workspaceDir}/${f}`);
    } catch {
      return false;
    }
  }
  return true;
}

function checkFileContent(
  workspaceDir: string,
  contentMap: Record<string, string>,
): boolean {
  for (const [filePath, expectedContent] of Object.entries(contentMap)) {
    try {
      const content = Deno.readTextFileSync(`${workspaceDir}/${filePath}`);
      if (!content.includes(expectedContent)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function copyDir(src: string, dest: string): Promise<void> {
  const entries = Deno.readDirSync(src);
  for (const entry of entries) {
    const srcPath = `${src}/${entry.name}`;
    const destPath = `${dest}/${entry.name}`;
    if (entry.isDirectory) {
      Deno.mkdirSync(destPath, { recursive: true });
      await copyDir(srcPath, destPath);
    } else {
      Deno.copyFileSync(srcPath, destPath);
    }
  }
}
