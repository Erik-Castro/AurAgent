import { assertEquals, assert } from '@std/assert';
import { DenoKVStore } from '../../src/adapters/deno-kv-store.ts';

Deno.test('DenoKVStore set e get', async () => {
  const store = new DenoKVStore(':memory:');
  try {
    await store.set('chave1', { hello: 'world' });
    const val = await store.get<{ hello: string }>('chave1');
    assertEquals(val, { hello: 'world' });
  } finally {
    store.close();
  }
});

Deno.test('DenoKVStore get retorna null para chave inexistente', async () => {
  const store = new DenoKVStore(':memory:');
  try {
    const val = await store.get('nao_existe');
    assertEquals(val, null);
  } finally {
    store.close();
  }
});

Deno.test('DenoKVStore delete remove chave', async () => {
  const store = new DenoKVStore(':memory:');
  try {
    await store.set('temp', 'valor');
    assertEquals(await store.get('temp'), 'valor');
    await store.delete('temp');
    assertEquals(await store.get('temp'), null);
  } finally {
    store.close();
  }
});

Deno.test('DenoKVStore list retorna todas as chaves', async () => {
  const store = new DenoKVStore(':memory:');
  try {
    await store.set('a', '1');
    await store.set('b', '2');
    await store.set('c', '3');
    const keys = await store.list();
    assertEquals(keys.length, 3);
  } finally {
    store.close();
  }
});

Deno.test('DenoKVStore list respeita limite', async () => {
  const store = new DenoKVStore(':memory:');
  try {
    for (let i = 0; i < 10; i++) {
      await store.set(`key:${i}`, `val${i}`);
    }
    const keys = await store.list(undefined, 3);
    assertEquals(keys.length, 3);
  } finally {
    store.close();
  }
});

Deno.test('DenoKVStore isOpen reflete estado', async () => {
  const store = new DenoKVStore(':memory:');
  assert(store.isOpen() === false);
  await store.set('x', 'y');
  assert(store.isOpen() === true);
  store.close();
  assert(store.isOpen() === false);
});
