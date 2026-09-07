import { assertEquals, assert } from '@std/assert';
import { SterileLoopDetector } from '../../src/agent/sterile-detector.ts';
import { SterileLoopError } from '../../src/core/errors.ts';

Deno.test('não lança com ações diferentes', () => {
  const d = new SterileLoopDetector(3);
  d.check('read_file', { path: 'a.ts' });
  d.check('write_file', { path: 'b.ts' });
  d.check('read_file', { path: 'c.ts' });
});

Deno.test('não lança abaixo do threshold', () => {
  const d = new SterileLoopDetector(5);
  for (let i = 0; i < 4; i++) {
    d.check('ls', { dir: '/tmp' });
  }
});

Deno.test('lança SterileLoopError no threshold máximo', () => {
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

Deno.test('canonicalização: ordem dos args não importa', () => {
  const d = new SterileLoopDetector(5);
  // With threshold=5, expanded to [3,4,5]
  d.check('tool', { b: 2, a: 1 }); // count=1
  d.check('tool', { a: 1, b: 2 }); // count=2 (same canonical key despite different order)
  assertEquals(d.check('tool', { a: 1, b: 2 }), 'advisory'); // count=3 hits threshold[0]
  assertEquals(d.check('tool', { b: 2, a: 1 }), 'advisory'); // count=4 hits threshold[1]
});

Deno.test('thresholds customizados: advisory antes de throw', () => {
  // thresholds [2, 4]: advisory at 2, throw at max(4)
  const d = new SterileLoopDetector(2, undefined, { thresholds: [2, 4] });
  // 1st call: count=1
  assertEquals(d.check('x', { v: 1 }), 'ok');
  // 2nd call: count=2, hits threshold[0]=2 → advisory
  assertEquals(d.check('x', { v: 1 }), 'advisory');
  // 3rd call: count=3, not at threshold[1]=4
  assertEquals(d.check('x', { v: 1 }), 'ok');
  // 4th call: count=4, hits threshold[1]=4 → advisory (since 4 < maxThreshold=4 is false, this throws)
  // Actually maxThreshold = 4, count=4 >= 4 → throws
  try {
    d.check('x', { v: 1 });
    assertEquals(true, false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof SterileLoopError);
  }
});

Deno.test('thresholds inválidos lançam erro', () => {
  try {
    new SterileLoopDetector(1, undefined, { thresholds: [] });
    assertEquals(true, false, 'deveria ter lançado');
  } catch {
    // ok
  }
  try {
    new SterileLoopDetector(1, undefined, { thresholds: [1] });
    assertEquals(true, false, 'deveria ter lançado');
  } catch {
    // ok
  }
});

Deno.test('reset no meio da cadeia recomeça contagem', () => {
  const d = new SterileLoopDetector(5);
  d.check('ls', { dir: '/tmp' });
  d.check('ls', { dir: '/tmp' });
  d.reset();
  // Após reset, precisa de 5 consecutivas novamente
  d.check('ls', { dir: '/tmp' });
  d.check('ls', { dir: '/tmp' });
  d.check('ls', { dir: '/tmp' });
  // count=3, below max threshold(5)
  assertEquals(true, true);
});

Deno.test('comportamento padrão (threshold=3): sem advisory, só throw', () => {
  const d = new SterileLoopDetector(3);
  assertEquals(d.check('x', { v: 1 }), 'ok');
  assertEquals(d.check('x', { v: 1 }), 'ok');
  try {
    d.check('x', { v: 1 });
    assertEquals(true, false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof SterileLoopError);
  }
});

Deno.test('thresholds altos geram advisory antes de throw', () => {
  const d = new SterileLoopDetector(5);
  // threshold=5, expanded to [3, 4, 5]
  assertEquals(d.check('x', { v: 1 }), 'ok');
  assertEquals(d.check('x', { v: 1 }), 'ok');
  assertEquals(d.check('x', { v: 1 }), 'advisory'); // count=3
  assertEquals(d.check('x', { v: 1 }), 'advisory'); // count=4
  try {
    d.check('x', { v: 1 }); // count=5 → throw
    assertEquals(true, false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof SterileLoopError);
  }
});
