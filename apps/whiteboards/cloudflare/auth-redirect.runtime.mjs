import {
  offlineEgressFence,
  recordNativeWorker,
  disposeNativeWorker,
} from '../../../scripts/ci/fixtures/native-worker-receipt.mjs';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = 'whiteboards';
const require = createRequire(import.meta.url);
// The production profile serves the apex mount next to the root host.
const MOUNTED = process.env.VITE_WHITEBOARDS_NATIVE_PROFILE === 'production';

test(
  'signed-out unknown paths redirect to login without a server error',
  { timeout: 120000 },
  async (t) => {
    assert.equal(process.env.CI, 'true', 'Run in owning CI after build');
    const { configPath } = readNativeRuntimeConfig(resolve('.'));
    const scratch = await mkdtemp(join(tmpdir(), `${app}-auth-redirect-`));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const envFile = join(scratch, 'empty.env');
    await writeFile(envFile, '', { mode: 0o600 });
    const registry = join(scratch, 'registry');
    await mkdir(registry);
    const values = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
      SUPABASE_SECRET_KEY: 'synthetic-server-key',
      TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-key',
      INTERNAL_WEB_API_ORIGIN: 'https://central.invalid',
    };
    const sdk = require('wrangler');
    const worker = await sdk.unstable_startWorker({
      config: configPath,
      envFiles: [envFile],
      sendMetrics: false,
      bindings: {
        ...Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            name,
            { type: 'plain_text', value },
          ])
        ),
      },
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider authentication forbidden');
        },
        outboundService: offlineEgressFence(),
      },
    });
    t.after(() => disposeNativeWorker(worker));
    await worker.ready;
    await recordNativeWorker(worker, resolve('.'));
    const origin = await worker.url;
    const get = (host, path) =>
      new Promise((resolveResponse, reject) => {
        request(
          {
            hostname: origin.hostname,
            port: origin.port,
            path,
            headers: { host },
          },
          (response) => {
            response.resume();
            response.on('end', () =>
              resolveResponse({
                status: response.statusCode,
                location: response.headers.location,
              })
            );
          }
        )
          .on('error', reject)
          .end();
      });
    const canonical = `${app}.tuturuuu.com`;
    const host = MOUNTED ? 'tuturuuu.com' : canonical;
    const base = MOUNTED ? '/whiteboards' : '';
    const missing = await get(host, `${base}/__native-smoke-missing__`);
    assert.ok(missing.status < 500, `unknown path: ${missing.status}`);
    if (missing.status >= 300 && missing.status < 400) {
      const target = new URL(missing.location, `https://${host}`);
      assert.match(target.pathname, /\/login/u);
    }
    const root = await get(host, `${base}/`);
    assert.ok(root.status < 500, `root: ${root.status}`);
    if (root.status >= 300 && root.status < 400) {
      const target = new URL(root.location, `https://${host}`);
      assert.match(target.pathname, /\/login/u);
    }
    const login = await get(host, `${base}/login`);
    assert.ok(login.status < 500, `login: ${login.status}`);
  }
);
