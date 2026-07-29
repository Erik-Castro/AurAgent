import type { ScenarioResult, EvalReport } from './types.ts';

export function calculateMetrics(
  results: ScenarioResult[],
): EvalReport['metrics'] {
  const total = results.length;
  if (total === 0) return { tra: 0, tmc: 0, regressionRate: 0 };

  const passed = results.filter((r) => r.status === 'passed').length;
  const tra = total > 0 ? passed / total : 0;

  const durations = results
    .filter((r) => r.status === 'passed')
    .map((r) => r.durationMs);
  const tmc = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const previous = loadPreviousResults();
  const regressionRate = previous && previous.total > 0
    ? calculateRegressionRate(results, previous)
    : 0;

  return {
    tra: Math.round(tra * 10000) / 100,
    tmc: Math.round(tmc),
    regressionRate: Math.round(regressionRate * 10000) / 100,
  };
}

interface PreviousBaseline {
  passed: string[];
  total: number;
}

const BASELINE_PATH = '.aur/eval-baseline.json';

function loadPreviousResults(): PreviousBaseline | null {
  try {
    const text = Deno.readTextFileSync(BASELINE_PATH);
    return JSON.parse(text) as PreviousBaseline;
  } catch {
    return null;
  }
}

export function saveBaseline(report: EvalReport): void {
  const baseline: PreviousBaseline = {
    passed: report.results
      .filter((r) => r.status === 'passed')
      .map((r) => r.scenarioId),
    total: report.total,
  };

  const dir = BASELINE_PATH.slice(0, BASELINE_PATH.lastIndexOf('/'));
  try {
    Deno.mkdirSync(dir, { recursive: true });
  } catch {
    // exists
  }
  Deno.writeTextFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
}

function calculateRegressionRate(
  current: ScenarioResult[],
  previous: PreviousBaseline,
): number {
  if (previous.total === 0) return 0;

  const regressed = current.filter(
    (r) =>
      previous.passed.includes(r.scenarioId) && r.status !== 'passed',
  ).length;

  return regressed / previous.total;
}
