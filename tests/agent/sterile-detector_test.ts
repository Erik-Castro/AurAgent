import { assertEquals, assert } from '@std/assert';
import { SterileLoopDetector } from '../../src/agent/sterile-detector.ts';
import { SterileLoopError } from '../../src/core/errors.ts';

Deno.test('não lança com ações diferentes', () => {
  const d = new SterileLoopDetector(3);
  d.check('read_file', { path: 'a.ts' });
  d.check('write_file', { path: 'b.ts' });
  d.check('read_file', { path: 'c.ts' });
  // nenhum throw
});

Deno.test('não lança abaixo do threshold', () => {
  const d = new SterileLoopDetector(5);
  for (let i = 0; i < 4; i++) {
    d.check('ls', { dir: '/tmp' });
  }
  // nenhum throw com threshold 5 e só 4 calls
});

Deno.test('lança SterileLoopError após N iguais consecutivas', () => {
  const d = new SterileLoopDetector(3);
  d.check('ls', { dir: '/tmp' });
  d.check('ls', { dir: '/tmp' });
  try {
    d.check('ls', { dir: '/tmp' });
    assertEquals(true, false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof SterileLoopError);
    assertEquals((err as SterileLoopError).repeatedAction, 'ls');
    assertEquals((err as SterileLoopError).repeatCount, 3);
  }
});

Deno.test('reset limpa histórico', () => {
  const d = new SterileLoopDetector(3);
  d.check('ls', { dir: '/tmp' });
  d.check('ls', { dir: '/tmp' });
  d.reset();
  d.check('ls', { dir: '/tmp' });
  d.check('ls', { dir: '/tmp' });
  // reset zerou, precisa de mais 3 para disparar
  assertEquals(true, true);
});
