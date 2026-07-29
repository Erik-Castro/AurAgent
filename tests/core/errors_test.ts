import { assertEquals, assertInstanceOf, assert } from '@std/assert';
import {
  DomainError,
  ToolExecutionError,
  HITLRequiredError,
  LoopLimitError,
  PermissionError,
  SterileLoopError,
  ConfigurationError,
  type Result,
} from '../../src/core/errors.ts';

Deno.test('DomainError instancia com code e message', () => {
  const err = new DomainError('algo deu errado', 'TEST_ERROR');
  assertEquals(err.message, 'algo deu errado');
  assertEquals(err.code, 'TEST_ERROR');
  assertEquals(err.name, 'DomainError');
});

Deno.test('ToolExecutionError com exitCode', () => {
  const err = new ToolExecutionError('falhou', 'bash', 1);
  assertInstanceOf(err, DomainError);
  assertEquals(err.toolName, 'bash');
  assertEquals(err.exitCode, 1);
  assertEquals(err.code, 'TOOL_EXECUTION_ERROR');
});

Deno.test('ToolExecutionError sem exitCode', () => {
  const err = new ToolExecutionError('timeout', 'bash');
  assertEquals(err.exitCode, undefined);
});

Deno.test('HITLRequiredError com args', () => {
  const args = { command: 'rm -rf /' };
  const err = new HITLRequiredError('requer aprovação', 'bash', args);
  assertEquals(err.toolName, 'bash');
  assertEquals(err.args, args);
  assertEquals(err.code, 'HITL_REQUIRED');
});

Deno.test('LoopLimitError com iterations', () => {
  const err = new LoopLimitError(10);
  assertEquals(err.message, 'Loop atingiu o limite máximo de 10 iterações');
  assertEquals(err.code, 'LOOP_LIMIT');
});

Deno.test('PermissionError com command', () => {
  const err = new PermissionError('sem permissão', 'write /etc/passwd');
  assertEquals(err.command, 'write /etc/passwd');
  assertEquals(err.code, 'PERMISSION_DENIED');
});

Deno.test('SterileLoopError com repeatedAction e repeatCount', () => {
  const err = new SterileLoopError('loop detectado', 'ls -la', 3);
  assertEquals(err.repeatedAction, 'ls -la');
  assertEquals(err.repeatCount, 3);
  assertEquals(err.code, 'STERILE_LOOP');
});

Deno.test('ConfigurationError com/sem key', () => {
  const withKey = new ConfigurationError('model inválido', 'model');
  assertEquals(withKey.key, 'model');
  assertEquals(withKey.code, 'CONFIGURATION_ERROR');

  const withoutKey = new ConfigurationError('config ausente');
  assertEquals(withoutKey.key, undefined);
});

Deno.test('Result union type ok true', () => {
  const result: Result<number> = { ok: true, value: 42 };
  assert(result.ok);
  assertEquals(result.value, 42);
});

Deno.test('Result union type ok false', () => {
  const err = new DomainError('falha', 'ERR');
  const result: Result<string> = { ok: false, error: err };
  assert(!result.ok);
  assertEquals(result.error.message, 'falha');
});
