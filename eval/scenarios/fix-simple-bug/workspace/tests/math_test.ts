import { assertEquals, assertRejects } from '@std/assert';
import { add, subtract, multiply, divide } from '../src/math.ts';

Deno.test('add', () => {
  assertEquals(add(2, 3), 5);
});

Deno.test('subtract', () => {
  assertEquals(subtract(5, 3), 2);
});

Deno.test('multiply', () => {
  assertEquals(multiply(4, 3), 12);
});

Deno.test('divide', () => {
  assertEquals(divide(10, 2), 5);
});

Deno.test('divide by zero', () => {
  assertRejects(() => Promise.resolve().then(() => divide(1, 0)));
});
