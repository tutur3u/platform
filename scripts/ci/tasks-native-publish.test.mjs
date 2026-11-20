import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveProductionVercelTargets } from './resolve-production-vercel-targets.ts';

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
