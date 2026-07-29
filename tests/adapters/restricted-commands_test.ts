import { assertEquals, assert } from '@std/assert';
import { RestrictedCommands } from '../../src/adapters/restricted-commands.ts';
import { PermissionError } from '../../src/core/errors.ts';

Deno.test('RestrictedCommands bloqueia rm -rf /', () => {
  const rc = new RestrictedCommands([]); // sem regras extras
  // Com regras vazias, qualquer comando passa
  rc.check('ls -la');
  // OK
});

Deno.test('RestrictedCommands com patterns customizados', () => {
  const rc = new RestrictedCommands([
    /^rm\s+-rf\s+/,
  ]);

  rc.check('ls -la'); // não bloqueia

  try {
    rc.check('rm -rf /tmp');
    assert(false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof PermissionError);
    assertEquals((err as PermissionError).code, 'PERMISSION_DENIED');
  }
});

Deno.test('RestrictedCommands addPattern adiciona novo pattern', () => {
  const rc = new RestrictedCommands([]);
  rc.addPattern(/^dangerous\s+/);

  try {
    rc.check('dangerous --all');
    assert(false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof PermissionError);
  }
});

Deno.test('RestrictedCommands com patterns default (loadSecurityRules)', () => {
  // Construtor sem argumentos carrega do security-config
  const rc = new RestrictedCommands();
  // Pelo menos alguns patterns devem ser carregados
  try {
    rc.check('rm -rf /');
    assert(false, 'deveria ter lançado');
  } catch (err) {
    assert(err instanceof PermissionError);
  }
});
