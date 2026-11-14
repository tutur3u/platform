import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runtimeOutcomeFailure } from '../../../scripts/start-bridge-codemod/runtime-outcome.mjs';

const CENTRAL_LOGIN = 'https://tuturuuu.com/login';

test('the root runtime expectation is the central login redirect', async () => {
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
  assert.deepEqual(expected, { redirect: CENTRAL_LOGIN });
  assert.match(
    source,
    /const EXPECTED = \{ ['"]\/['"]: \{ redirect: ['"]https:\/\/tuturuuu\.com\/login['"] \} \};/u
  );
  const outcome = {
    path: '/',
    expected,
    origin: 'https://rewise.tuturuuu.com',
  };
  assert.equal(
    runtimeOutcomeFailure({
      ...outcome,
      status: 307,
      location: `${CENTRAL_LOGIN}?returnUrl=https%3A%2F%2Frewise.tuturuuu.com%2Fverify-token%3FnextUrl%3D%252F`,
    }),
    null
  );
  assert.ok(runtimeOutcomeFailure({ ...outcome, status: 200 }));
  assert.ok(
    runtimeOutcomeFailure({ ...outcome, status: 307, location: '/login' })
  );
  assert.ok(
    runtimeOutcomeFailure({
      ...outcome,
      status: 307,
      location: 'https://unknown.invalid/login',
    })
  );
});
