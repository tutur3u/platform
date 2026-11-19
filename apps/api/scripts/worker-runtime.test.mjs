import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { startCfViteWorker } from '../../../scripts/ci/cf-vite-worker.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const buildOutputMarker = path.join(
  root,
  '.cloudflare',
  'output',
  'v0',
  'config.json'
);
const message =
  'Emitted API Worker artifact is absent; run apps/api build, then test:runtime.';

if (!existsSync(buildOutputMarker)) {
  if (process.env.API_WORKER_RUNTIME_REQUIRED === '1') {
    throw new Error(message);
  }
  test('emitted API Worker runtime', { skip: message }, () => {});
} else {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const secrets = {
    API_WORKER_OPERATIONS: 'getHealth,getBuildInfo,getMobileVersion',
    MOBILE_VERSION_POLICY: JSON.stringify({
      ios: {
        minimumSupportedBuild: 42,
        latestBuild: 50,
        storeUrl: 'https://apps.apple.com/app/example',
      },
      android: {
        minimumSupportedBuild: 12,
        latestBuild: 15,
        storeUrl: 'https://play.google.com/store/apps/details?id=example',
      },
    }),
  };
  let server;
  before(async () => {
    server = await startCfViteWorker({
      root,
      mode: 'build-output',
      secrets,
    });
  });
  after(async () => {
    await server?.close();
  });

  test('emitted Worker serves health, exact build identity and mobile forced update', async () => {
    const health = await server.fetch('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.ok(health.headers.get('x-request-id'));
    const build = await server.fetch('/api/build-info');
    assert.equal((await build.json()).commitHash, sha);
    const version = await server.fetch(
      '/api/v1/mobile/version?platform=ios&build=41'
    );
    assert.equal(version.status, 200);
    assert.equal((await version.json()).requiresUpdate, true);
  });

  test('emitted Worker denies unknown paths and unconfigured retained origin', async () => {
    const unknown = await server.fetch('/api/not-a-route');
    assert.equal(unknown.status, 404);
    await unknown.text();
    const retained = await server.fetch(
      '/api/v1/mobile/version-check?platform=ios&version=1.0.0'
    );
    assert.equal(retained.status, 503);
    await retained.text();
  });
}
