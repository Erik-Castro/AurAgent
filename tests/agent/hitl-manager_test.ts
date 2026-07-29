import { assertEquals } from '@std/assert';
import { HITLManager } from '../../src/agent/hitl-manager.ts';

Deno.test('HITLManager rejeita por padrão (default r)', () => {
  const manager = new HITLManager();
  // Nota: este teste usa prompt() que no Deno sem TTY retorna null,
  // que é tratado como 'r' (rejeitar)
  const decision = manager.requestApproval('WriteFile', { path: '/tmp/test' }, 'high');
  assertEquals(decision.approved, false);
});

Deno.test('HITLManager retorna rejeição com razão', () => {
  const manager = new HITLManager();
  const decision: { approved: false; reason?: string } = manager.requestApproval('GitCommit', { message: 'wip' }, 'medium') as { approved: false; reason?: string };
  assertEquals(decision.approved, false);
  assertEquals(decision.reason, 'Rejeitado pelo usuário');
});
