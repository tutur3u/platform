import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const app = process.argv[2];
assert.ok(['mail', 'apps'].includes(app));
assert.equal(process.env.CI, 'true', 'Emitted Worker smoke runs in CI only');
const root = resolve('apps', app);
const receipt = JSON.parse(
  await readFile(join(root, 'cutover-receipt.json'), 'utf8')
);
const configPath = resolve(root, receipt.config);
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.equal(config.workers_dev, false);
assert.equal(config.preview_urls, false);
const { requiredRuntimeSecrets } = await import(
  `../../apps/${app}/cloudflare/runtime-secrets.ts`
);
const { unstable_startWorker } = createRequire(join(root, 'package.json'))(
  'wrangler'
);
const scratch = await mkdtemp(join(tmpdir(), 'cf2-runtime-'));
await writeFile(join(scratch, 'empty.env'), '');
try {
  for (const [host, missing] of [
    [`${app}.tuturuuu.com`, false],
    ['unknown.invalid', false],
    [`${app}.tuturuuu.com`, true],
  ]) {
    const worker = await unstable_startWorker({
      config: configPath,
      envFiles: [join(scratch, 'empty.env')],
      sendMetrics: false,
      bindings: Object.fromEntries(
        requiredRuntimeSecrets
          .filter((name) => !missing || name !== 'SUPABASE_SECRET_KEY')
          .map((name) => [
            name,
            {
              type: 'secret_text',
              value:
                name === 'NEXT_PUBLIC_SUPABASE_URL'
                  ? 'https://runtime.supabase.invalid'
                  : 'disposable-runtime-fixture-only',
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
        outboundService: async () =>
          new Response('Egress denied', { status: 599 }),
      },
    });
    try {
      await worker.ready;
      const response = await worker.fetch(`https://${host}/`, {
        redirect: 'manual',
      });
      if (missing)
        assert.ok(
          response.status >= 500,
          'Missing required secret must refuse serving'
        );
      else if (host === 'unknown.invalid') assert.equal(response.status, 404);
      else if (app === 'mail') {
        assert.ok([301, 302, 303, 307, 308].includes(response.status));
        assert.match(
          new URL(response.headers.get('location'), `https://${host}`).pathname,
          /\/(?:en\/|vi\/)?login$/u
        );
      } else assert.equal(response.status, 200, 'Apps catalogue is public');
      await response.body?.cancel();
    } finally {
      await worker.dispose();
    }
  }
  console.log(
    `${app}: anonymous entry, unknown-host rejection and missing-secret refusal passed`
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
