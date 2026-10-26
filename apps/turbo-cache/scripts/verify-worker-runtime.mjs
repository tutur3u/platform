import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('real Worker initializes transactional DO storage and retains its fence after restart', {
  timeout: 120_000,
}, async () => {
  const admin = randomUUID() + randomUUID();
  const token = randomUUID() + randomUUID();
  const worker = await startCfViteWorker({
    root,
    mode:
      process.env.TURBO_CACHE_TEST_BUILD_OUTPUT === '1'
        ? 'build-output'
        : 'source',
    secrets: {
      TURBO_CACHE_ADMIN_TOKEN_SHA256: digest(admin),
      TURBO_CACHE_TOKENS: JSON.stringify([
        {
          id: 'runtime-fixture',
          sha256: digest(token),
          read: ['fixture'],
          write: 'fixture',
        },
      ]),
    },
  });
  const call = (path, { auth = admin, ...init } = {}) =>
    worker.fetch(path, {
      ...init,
      headers: {
        authorization: `Bearer ${auth}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
  const fence = (action) =>
    call('/admin/fence', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  try {
    // The production default must stay off in both source and emitted output.
    const status = await call('/v8/artifacts/status', { auth: token });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { status: 'disabled' });
    for (const path of ['/admin/budget', '/admin/fence']) {
      const denied = await call(path, { auth: 'invalid-disposable-fixture' });
      assert.equal(denied.status, 401);
      await denied.arrayBuffer();
    }
    const missing = await call('/admin/budget');
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { error: 'budget_unavailable' });

    const initialized = await fence('reset');
    assert.equal(initialized.status, 200);
    const initial = await initialized.json();
    assert.equal(initial.fence.tripped, false);
    const tripped = await fence('trip');
    assert.equal(tripped.status, 200);
    const stopped = await tripped.json();
    assert.equal(stopped.fence.tripped, true);
    assert.equal(stopped.fence.reason, 'operator');
    const duplicate = await fence('trip');
    assert.equal(duplicate.status, 200);
    assert.deepEqual(await duplicate.json(), stopped);

    await worker.restart();
    const restored = await call('/admin/budget');
    assert.equal(restored.status, 200);
    assert.equal(restored.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await restored.json(), stopped);
    for (const method of ['GET', 'PUT']) {
      const disabled = await call('/v8/artifacts/0123456789abcdef', {
        method,
        auth: token,
        ...(method === 'PUT' ? { body: 'fixture' } : {}),
      });
      assert.equal(disabled.status, 503);
      assert.deepEqual(await disabled.json(), {
        error: { code: 'cache_disabled', message: 'cache_disabled' },
      });
    }
    const afterDisabled = await call('/admin/budget');
    assert.equal(afterDisabled.status, 200);
    assert.deepEqual(await afterDisabled.json(), stopped);
    const reset = await fence('reset');
    assert.equal(reset.status, 200);
    assert.equal((await reset.json()).fence.tripped, false);
  } finally {
    await worker.close();
  }
});
