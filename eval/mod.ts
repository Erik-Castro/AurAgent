import { runEvalSuite } from './runner.ts';
import { calculateMetrics, saveBaseline } from './metrics.ts';
import { printReport, formatJsonReport } from './reporter.ts';
import type { EvalReport } from './types.ts';
import { DEFAULT_MODEL } from '../src/core/constants.ts';

interface CliOptions {
  model: string;
  scenarioDir: string;
  save: boolean;
  jsonOutput: boolean;
}

function parseArgs(): CliOptions {
  let model = Deno.env.get('AUR_MODEL') ?? DEFAULT_MODEL;
  let jsonOutput = false;
  let save = false;

  const args = Deno.args.slice();
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
        if (i + 1 < args.length) model = args[++i];
        break;
      case '--json':
        jsonOutput = true;
        break;
      case '--save':
        save = true;
        break;
    }
  }

  return { model, scenarioDir: `${import.meta.dirname}/scenarios`, save, jsonOutput };
}

if (import.meta.main) {
  const opts = parseArgs();
  const startTime = Date.now();

  console.error(`Aur Eval Suite — modelo: ${opts.model}\n`);

  const results = await runEvalSuite({
    model: opts.model,
    scenarioDir: opts.scenarioDir,
  });

  const durationMs = Date.now() - startTime;
  const metrics = calculateMetrics(results);

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    model: opts.model,
    durationMs,
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status !== 'passed').length,
    results,
    metrics,
  };

  if (opts.save) saveBaseline(report);

  if (opts.jsonOutput) {
    console.log(formatJsonReport(report));
  } else {
    printReport(report);
  }

  if (report.failed > 0) Deno.exit(1);
}
