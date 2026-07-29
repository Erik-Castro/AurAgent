export interface Scenario {
  id: string;
  description: string;
  task: string;
  expectedStatus: 'success' | 'error';
  maxIterations: number;
  checkTest: boolean;
  checkPatch: boolean;
  checkFiles?: string[];
  checkContent?: Record<string, string>;
}

export interface ScenarioResult {
  scenarioId: string;
  status: 'passed' | 'failed' | 'error';
  agentStatus: string;
  output: string;
  iterations: number;
  durationMs: number;
  testPassed: boolean;
  patchMatched: boolean;
  filesExist: boolean;
  contentMatched: boolean;
  errors: string[];
}

export interface EvalReport {
  timestamp: string;
  model: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  results: ScenarioResult[];
  metrics: {
    tra: number;
    tmc: number;
    regressionRate: number;
  };
}

export function loadScenario(path: string): Scenario {
  const text = Deno.readTextFileSync(path);
  return JSON.parse(text) as Scenario;
}
