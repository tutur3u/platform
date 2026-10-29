// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct CI entrypoint; deployment credentials never enter Turbo builds.
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { verify } from './wave1-native-artifact.mjs';

// CI-only: starts workerd from sealed prebundled bytes, never builds or publishes.
assert.equal(process.env.CI, 'true');
const [app, environment, sha] = process.argv.slice(2);
const appRoot = resolve('apps', app);
const { receipt } = verify(appRoot, app, environment, sha);
assert.ok(
  !process.env.CLOUDFLARE_API_TOKEN,
  'No provider credential in runtime gate'
);
const scratch = await mkdtemp(join(tmpdir(), 'wave1-runtime-'));
await cp(join(appRoot, 'dist'), join(scratch, 'dist'), {
  recursive: true,
  errorOnExist: true,
});
await writeFile(join(scratch, 'empty.env'), '');
const require = createRequire(resolve(appRoot, 'package.json'));
const { unstable_startWorker } = require('wrangler');
const egress = [];
let clean = false;
try {
  const hosts = [receipt.profile.host];
  if (app === 'apps' && environment === 'staging')
    hosts.push('apps.tuturuuu.com');
  for (const host of hosts) {
    let worker;
    try {
      worker = await unstable_startWorker({
        config: join(scratch, 'dist/wave1/wrangler.json'),
        envFiles: [join(scratch, 'empty.env')],
        sendMetrics: false,
        bindings: Object.fromEntries(
          receipt.profile.secrets.map((name) => [
            name,
            {
              type: 'secret_text',
              value:
                name === 'NEXT_PUBLIC_SUPABASE_URL'
                  ? 'https://wave1-runtime.supabase.invalid'
                  : 'wave1_disposable_fixture_only',
            },
          ])
        ),
        build: { bundle: false, processEntrypoint: false },
        dev: {
          remote: false,
          watch: false,
          persist: false,
          inspector: false,
          liveReload: false,
          generateTypes: false,
          enableContainers: false,
          registry: join(scratch, 'registry'),
          server: { hostname: '127.0.0.1', port: 0 },
          origin: { hostname: host, secure: true },
          inferOriginFromRoutes: false,
          routeRequestsByRoutes: false,
          auth: () => {
            throw new Error('Provider auth forbidden');
          },
          outboundService: async () => {
            egress.push('denied');
            return new Response('Egress denied', { status: 599 });
          },
        },
      });
      await worker.ready;
      const fetchWorker = (path, init = {}) =>
        worker.fetch(`https://${host}${path}`, { ...init, redirect: 'manual' });
      const identity = await fetchWorker('/api/build-info');
      if (
        app === 'apps' &&
        environment === 'staging' &&
        host === 'apps.tuturuuu.com'
      ) {
        assert.equal(
          identity.status,
          503,
          'Staging canonical fence must reject'
        );
        continue;
      }
      assert.equal(
        identity.status,
        200,
        'Native build identity must be reachable'
      );
      const info = await identity.json();
      assert.equal(info.appName, app);
      assert.equal(
        info.commitHash,
        sha,
        'Actual bundled source identity differs'
      );
      assert.equal(info.environment, environment);
      assert.match(identity.headers.get('cache-control'), /no-store/);
      const post = await fetchWorker('/api/build-info', { method: 'POST' });
      assert.equal(
        post.status,
        405,
        'Identity route must not accept mutations'
      );
      const head = await fetchWorker('/api/build-info', { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      // Actual static bytes must survive original and restored workerd execution.
      const file = Object.keys(receipt.files).find(
        (name) => name.startsWith('client/assets/') && name.endsWith('.js')
      );
      assert.ok(file, 'Native client asset missing');
      const response = await fetchWorker(`/${file.slice('client/'.length)}`);
      assert.equal(response.status, 200);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        await readFile(join(appRoot, 'dist', file))
      );
      if (app === 'mail' || app === 'calendar') {
        const page = await fetchWorker(
          '/en/00000000-0000-4000-8000-000000000001'
        );
        assert.equal(
          page.status,
          307,
          'Anonymous native page must hand off to central login'
        );
        const target = new URL(page.headers.get('location'));
        assert.equal(
          target.hostname,
          environment === 'production'
            ? 'tuturuuu.com'
            : 'web.staging.tutur3u.com'
        );
        assert.ok(target.pathname.includes('login'));
      }
    } finally {
      if (worker) await worker.dispose();
    }
  }
  assert.deepEqual(
    egress,
    [],
    'Anonymous acceptance unexpectedly contacted a supplier'
  );
  verify(appRoot, app, environment, sha);
  clean = true;
  console.log(
    `Accepted original/restored ${app} ${environment} artifact ${sha}`
  );
} finally {
  // Failed evidence is retained for CI diagnostics; the job watchdog owns SDK hangs.
  if (clean) await rm(scratch, { recursive: true });
}
