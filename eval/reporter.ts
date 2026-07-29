import type { EvalReport } from './types.ts';

export function printReport(report: EvalReport): void {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  AUR EVAL SUITE — RELATÓRIO`);
  console.log(line);
  console.log(`  Modelo:     ${report.model}`);
  console.log(`  Timestamp:  ${report.timestamp}`);
  console.log(`  Duração:    ${report.durationMs}ms`);
  console.log(line);
  console.log(`  Total:      ${report.total}`);
  console.log(`  Passou:     ${report.passed}`);
  console.log(`  Falhou:     ${report.failed}`);
  console.log(line);
  console.log(`  TRA:        ${report.metrics.tra}%`);
  console.log(`  TMC:        ${report.metrics.tmc}ms`);
  console.log(`  Regressão:  ${report.metrics.regressionRate}%`);
  console.log(line);

  for (const r of report.results) {
    const icon = r.status === 'passed' ? '✅' : '❌';
    console.log(`\n  ${icon} ${r.scenarioId}`);
    console.log(`     Status: ${r.status}`);
    console.log(`     Iterações: ${r.iterations}`);
    console.log(`     Duração: ${r.durationMs}ms`);
    if (r.errors.length > 0) {
      for (const err of r.errors) console.log(`     ! ${err}`);
    }
  }
  console.log(`\n${line}\n`);
}

export function formatJsonReport(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}
