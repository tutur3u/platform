import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/worker.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  write: false,
});
const dir = await mkdtemp(join(tmpdir(), 'fleet-status-'));
const fixtures = {
  FLEET_STATUS_ENABLED: 'true',
  FLEET_STATUS_REPOS: 'owner/repo',
  FLEET_STATUS_OPERATOR_TOKEN: 'fixture-operator',
  FLEET_STATUS_READ_TOKEN: 'fixture-reader',
  GITHUB_WEBHOOK_SECRET: 'fixture-webhook',
};
const runtime = () =>
  new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: outputFiles[0].text,
      compatibilityDate: '2026-09-28',
      bindings: fixtures,
      durableObjects: {
        FLEET_STATUS_STATE: { className: 'FleetStatusState', useSQLite: true },
      },
      resourcePersistencePath: dir,
      telemetry: { enabled: false },
    })
  );
const sha = 'a'.repeat(40);
const readPath = `https://worker.test/v1/repos/owner/repo/commits/${sha}/status`;
const read = (mf) =>
  mf.dispatchFetch(readPath, {
    headers: { Authorization: 'Bearer fixture-reader' },
  });
const control = (mf, action) =>
  mf.dispatchFetch(`https://worker.test/v1/control/${action}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fixture-operator' },
  });
const body = JSON.stringify({
  repository: { full_name: 'owner/repo' },
  workflow_run: {
    id: 1,
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    updated_at: '2026-11-28T00:00:00Z',
  },
});
const sign = (bytes) =>
  `sha256=${createHmac('sha256', fixtures.GITHUB_WEBHOOK_SECRET)
    .update(bytes)
    .digest('hex')}`;
const deliver = (mf, signature) =>
  mf.dispatchFetch('https://worker.test/v1/github/webhook', {
    method: 'POST',
    body,
    headers: {
      'X-GitHub-Event': 'workflow_run',
      'X-GitHub-Delivery': '00000000-0000-4000-8000-000000000001',
      'X-Hub-Signature-256': signature,
    },
  });

let mf;
try {
  mf = runtime();
  assert.equal((await read(mf)).status, 503);
  assert.equal((await control(mf, 'start')).status, 204);
  assert.equal((await deliver(mf, sign('wrong bytes'))).status, 403);
  const results = await Promise.all(
    Array.from({ length: 6 }, () => deliver(mf, sign(body)))
  );
  assert.ok(results.every((result) => result.status === 204));
  const snapshot = await read(mf);
  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(
    (await snapshot.json()).runs.map((run) => run.id),
    [1]
  );
  assert.equal((await control(mf, 'stop')).status, 204);
  await mf.dispose();
  mf = runtime();
  assert.equal((await read(mf)).status, 503);
  assert.equal((await deliver(mf, sign(body))).status, 503);
  console.log(
    'Workerd verified signed ingress, concurrent dedup, private reads, and the stop fence after restart.'
  );
} finally {
  await mf?.dispose();
  await rm(dir, { recursive: true, force: true });
}
