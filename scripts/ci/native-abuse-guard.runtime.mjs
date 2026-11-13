import { createRequire } from 'node:module';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startNativeAbuseGuard } from './fixtures/native-abuse-guard.mjs';
const require = createRequire(
  new URL('../../apps/mind/package.json', import.meta.url)
);
test(
  'isolated first-party guard admits and refuses quota and foreign callers',
  { timeout: 120000 },
  async (t) => {
    const registry = await mkdtemp(join(tmpdir(), 'guard-registry-'));
    t.after(() => rm(registry, { recursive: true, force: true }));
    await startNativeAbuseGuard(t, require('wrangler'), registry);
  }
);

test(
  'workerd egress canary is denied by the app fixture fence',
  { timeout: 120000 },
  async (t) => {
    const { writeFile } = await import('node:fs/promises');
    const { offlineEgressFence, disposeNativeWorker } =
      await import('./fixtures/native-worker-receipt.mjs');
    const directory = await mkdtemp(join(tmpdir(), 'offline-canary-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(
      join(directory, 'canary.mjs'),
      'export default { fetch() { return fetch("https://offline-canary.invalid"); } };'
    );
    await writeFile(
      join(directory, 'wrangler.json'),
      JSON.stringify({
        name: 'offline-canary',
        main: 'canary.mjs',
        compatibility_date: '2026-10-12',
      })
    );
    await writeFile(join(directory, 'empty.env'), '', { mode: 0o600 });
    const egress = [];
    const worker = await require('wrangler').unstable_startWorker({
      config: join(directory, 'wrangler.json'),
      envFiles: [join(directory, 'empty.env')],
      sendMetrics: false,
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        registry: join(directory, 'registry'),
        server: { hostname: '127.0.0.1', port: 0 },
        auth() {
          throw new Error('Provider authentication forbidden');
        },
        outboundService: offlineEgressFence(egress, 599),
      },
    });
    t.after(() => disposeNativeWorker(worker));
    await worker.ready;
    const { default: assert } = await import('node:assert/strict');
    assert.equal((await fetch(await worker.url)).status, 599);
    assert.deepEqual(egress, ['https://offline-canary.invalid']);
  }
);
