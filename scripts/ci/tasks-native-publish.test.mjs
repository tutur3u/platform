import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveProductionVercelTargets } from './resolve-production-vercel-targets.ts';
import { waitForTasksPreview } from './tasks-preview-readback.mjs';

test('Tasks activation waits for two consecutive reads of its preview', async (t) => {
  const ids = ['previous', 'preview', 'previous', 'preview', 'preview'];
  const read = t.mock.fn(async () => ({ id: ids.shift() }));
  const pause = t.mock.fn(async () => {});

  await waitForTasksPreview(read, 'previous', 'preview', { pause });

  assert.equal(read.mock.callCount(), 5);
  assert.equal(pause.mock.callCount(), 4);
});

test('Tasks activation fails immediately when another deployment appears', async (t) => {
  const read = t.mock.fn(async () => ({ id: 'other' }));
  const pause = t.mock.fn(async () => {});

  await assert.rejects(
    waitForTasksPreview(read, 'previous', 'preview', { pause }),
    /Active Tasks deployment changed to other/u
  );

  assert.equal(read.mock.callCount(), 1);
  assert.equal(pause.mock.callCount(), 0);
});

test('Tasks activation bounds a stalled deployment read', async (t) => {
  const controller = new AbortController();
  const read = t.mock.fn(async (signal) => {
    assert.equal(signal, controller.signal);
    controller.abort();
    signal.throwIfAborted();
  });

  await assert.rejects(
    waitForTasksPreview(read, 'previous', 'preview', {
      signal: controller.signal,
    }),
    /Tasks preview deployment preview did not stabilize/u
  );

  assert.equal(read.mock.callCount(), 1);
});

test('Tasks bootstraps the Worker marker while the Vercel publisher stays disabled', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => [],
  }));
  const [worker, vercel] = await resolveProductionVercelTargets({
    eventName: 'push',
    headSha: 'a'.repeat(40),
    refName: 'production',
    rootDir: process.cwd(),
    workspaceManifests: [],
    targets: [
      { productionWorkflow: 'tasks-cloudflare.yaml' },
      { productionWorkflow: 'vercel-production-tasks.yaml' },
    ],
  });
  assert.equal(worker.shouldRun, true);
  assert.equal(worker.changeResult.source, 'deployment-marker-unavailable');
  assert.equal(vercel.shouldRun, false);
  assert.match(vercel.reason, /publisher disabled/u);
});
