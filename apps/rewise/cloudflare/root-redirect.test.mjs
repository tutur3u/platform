import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runtimeOutcomeFailure } from '../../../scripts/start-bridge-codemod/runtime-outcome.mjs';

test('root runtime expectations require the login redirect', async () => {
  const routes = JSON.parse(
    await readFile(
      new URL('../start-bridge.routes.json', import.meta.url),
      'utf8'
    )
  );
  const source = await readFile(
    new URL('./native-built-worker.runtime.mjs', import.meta.url),
    'utf8'
  );
  const expected = routes.runtime['/'];
  assert.deepEqual(expected, { redirect: '/login' });
  assert.match(
    source,
    /const EXPECTED = \{ ['"]\/['"]: \{ redirect: ['"]\/login['"] \} \};/u
  );
  const outcome = {
    path: '/',
    expected,
    origin: 'https://rewise.tuturuuu.com',
  };
  assert.equal(
    runtimeOutcomeFailure({ ...outcome, status: 302, location: '/login' }),
    null
  );
  assert.ok(runtimeOutcomeFailure({ ...outcome, status: 200 }));
  assert.ok(
    runtimeOutcomeFailure({ ...outcome, status: 302, location: '/wrong' })
  );
  assert.ok(
    runtimeOutcomeFailure({
      ...outcome,
      status: 302,
      location: 'https://unknown.invalid/login',
    })
  );
});
