import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { drainOwnedProcessGroup } from './owned-process-group.mjs';
import { runtimeDeadline } from './runtime-deadline.mjs';

test('built staging Worker and emitted assets preserve the public contract', {
  timeout: 45_000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Built runtime verification belongs in CI, after the owning build'
  );
  const runtime = runtimeDeadline(t.signal, 38_000);
  const source = process.env.CI_SOURCE_SHA;
  assert.match(source ?? '', /^[a-f0-9]{40}$/);
  const temporary = await mkdtemp(join(tmpdir(), 'apps-gateway-ci-'));
  const child = spawn(
    'bun',
    [
      'x',
      '--no-install',
      'wrangler',
      'dev',
      '--local',
      '--config',
      'dist/worker/wrangler.json',
      '--ip',
      '127.0.0.1',
      '--port',
      '8797',
      '--persist-to',
      join(temporary, 'state'),
      '--var',
      `SOURCE_SHA:${source}`,
    ],
    {
      cwd: new URL('../', import.meta.url),
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    }
  );
  let closed = false;
  let launcherError;
  child.once('close', () => {
    closed = true;
  });
  child.once('error', (error) => {
    launcherError = error;
  });
  const ownedGroup = child.pid;
  t.after(async () => {
    // Launcher exit does not establish that its descendants have exited.
    // Preserve the private state directory if an owned group cannot be drained.
    if (ownedGroup) await drainOwnedProcessGroup(ownedGroup);
    await rm(temporary, { recursive: true, force: true });
  });
  const origin = 'http://127.0.0.1:8797';
  let ready = false;
  for (let attempt = 0; attempt < 100 && !closed; attempt += 1) {
    try {
      runtime.check();
      const result = await runtime.fetch(`${origin}/api/build-info`, {}, 500);
      if (result.ok) {
        ready = true;
        break;
      }
    } catch {
      runtime.check(); // A failed readiness probe must not swallow cancellation.
    }
    await runtime.wait(200);
  }
  assert.equal(
    ready,
    true,
    launcherError
      ? 'Owned local Worker could not be launched'
      : 'Owned local Worker must start from the emitted config'
  );
  const info = await runtime.json(
    await runtime.fetch(`${origin}/api/build-info`)
  );
  assert.equal(info.sourceSha, source);
  assert.equal(info.fullAppPort, false);
  const catalogue = await runtime.fetch(origin, {
    headers: { cookie: 'NEXT_LOCALE=vi' },
  });
  const html = await runtime.text(catalogue);
  assert.equal(catalogue.status, 200);
  assert.match(html, /<html lang="vi">/);
  assert.match(html, /Mọi ứng dụng công việc cần/);
  const script = html.match(/src="(\/assets\/[^" ]+\.js)"/);
  assert.ok(script, 'Actual emitted entry script must be present');
  assert.equal((await runtime.fetch(new URL(script[1], origin))).status, 200);
  assert.equal(
    (await runtime.fetch(`${origin}/theme-bootstrap.js`)).status,
    200
  );
  const launch = await runtime.fetch(`${origin}/Meeting/a%2Fb?tag=1&tag=2`, {
    redirect: 'manual',
  });
  assert.equal(launch.status, 307);
  assert.equal(
    launch.headers.get('location'),
    'https://meet.tuturuuu.com/a%2Fb?tag=1&tag=2&source=apps'
  );
  assert.equal((await runtime.fetch(`${origin}/api/private`)).status, 404);
  assert.equal(
    (await runtime.fetch(`${origin}/`, { method: 'POST' })).status,
    405
  );
  const account = await runtime.fetch(`${origin}//evil.test`, {
    redirect: 'manual',
    headers: { cookie: 'tuturuuu_app_session=fixture' },
  });
  assert.equal(
    new URL(account.headers.get('location')).origin,
    'https://apps.tuturuuu.com'
  );
});
