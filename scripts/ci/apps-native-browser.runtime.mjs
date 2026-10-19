import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyNativeBrowserNavigation } from '../../apps/apps/cloudflare/native-browser-navigation.mjs';

const app = fileURLToPath(new URL('../../apps/apps/', import.meta.url));
const ownRequire = createRequire(
  new URL('../../apps/apps/package.json', import.meta.url)
);
const browserRequire = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);
const { unstable_getMiniflareWorkerOptions } = ownRequire('wrangler');
const { Miniflare } = ownRequire(
  ownRequire.resolve('miniflare', {
    paths: [dirname(ownRequire.resolve('wrangler'))],
  })
);
const { chromium } = browserRequire('playwright');
const fixtures = JSON.parse(
  readFileSync(resolve(app, 'cloudflare/native-route-fixtures.json'), 'utf8')
);

function verifySealedOutput() {
  assert.match(process.env.APPS_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.ok(
    process.env.APPS_ARTIFACT_RECEIPT,
    'Require the actual sealed artifact receipt'
  );
  execFileSync(
    'python3',
    [
      fileURLToPath(new URL('./apps-native-artifact.py', import.meta.url)),
      'verify',
      app,
      '--receipt',
      process.env.APPS_ARTIFACT_RECEIPT,
    ],
    { stdio: 'pipe' }
  );
}

test('ordinary catalogue anchors retain every query contract through the emitted Worker', {
  timeout: 240000,
}, async (t) => {
  assert.equal(process.env.CI, 'true');
  verifySealedOutput();
  const redirect = JSON.parse(
    readFileSync(resolve(app, '.wrangler/deploy/config.json'), 'utf8')
  );
  assert.deepEqual(Object.keys(redirect).sort(), [
    'auxiliaryWorkers',
    'configPath',
  ]);
  assert.deepEqual(redirect.auxiliaryWorkers, []);
  const configPath = resolve(app, '.wrangler/deploy', redirect.configPath);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const { workerOptions, externalWorkers } =
    unstable_getMiniflareWorkerOptions(configPath);
  const unexpected = [];
  const secret = randomBytes(32).toString('hex');
  const egress = async (request) => {
    // Synthetic anonymous sessions should not need provider access.
    const url = new URL(request.url);
    unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
    return new Response('Unexpected disposable-fixture egress', {
      status: 599,
    });
  };
  const runtime = new Miniflare({
    host: '127.0.0.1',
    port: 0,
    workers: [
      {
        ...workerOptions,
        name: config.name,
        modules: true,
        scriptPath: resolve(dirname(configPath), config.main),
        modulesRoot: dirname(resolve(dirname(configPath), config.main)),
        bindings: {
          ...workerOptions.bindings,
          TUTURUUU_NOINDEX: '1',
          TUTURUUU_APP_COORDINATION_SECRET: secret,
          SUPABASE_SECRET_KEY: 'disposable-unused-fixture',
          NEXT_PUBLIC_SUPABASE_URL: 'https://apps-ci.supabase.invalid',
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
            'sb_publishable_apps_ci_placeholder',
        },
        outboundService: egress,
      },
      ...externalWorkers.map((worker) => ({
        ...worker,
        outboundService: egress,
      })),
    ],
  });
  t.after(async () => {
    await runtime.dispose();
  });
  const origin = (await runtime.ready).origin;
  const canonical = await runtime.dispatchFetch('https://apps.tuturuuu.com/', {
    redirect: 'manual',
  });
  assert.equal(
    canonical.status,
    503,
    'Staging must reject canonical-host activation'
  );
  assert.match(canonical.headers.get('x-robots-tag') ?? '', /noindex/);
  const html = await runtime.dispatchFetch(origin);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('x-robots-tag') ?? '', /noindex/);
  assert.match(html.headers.get('cache-control') ?? '', /no-store/);
  const info = await runtime.dispatchFetch(
    new URL('/api/build-info', origin).href
  );
  assert.equal(info.status, 200);
  assert.equal(
    (await info.json()).commitHash,
    process.env.APPS_SOURCE_SHA,
    'Build identity must come from compiled metadata, without a runtime SHA override'
  );
  const browser = await chromium.launch({ headless: true });
  t.after(async () => {
    await browser.close();
  });
  const guardedBrowser = {
    async newPage() {
      const page = await browser.newPage({ serviceWorkers: 'block' });
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        unexpected.push(`browser ${url.origin}${url.pathname}`);
        return route.abort('blockedbyclient');
      });
      return page;
    },
  };
  // The frozen helper adds higher-priority disposable destination fulfillment,
  // then clicks the actual catalogue anchors against this workerd HTTP listener.
  await verifyNativeBrowserNavigation(guardedBrowser, origin, fixtures);
  assert.equal(
    unexpected.length,
    0,
    'Unexpected fixture egress must remain zero'
  );
  verifySealedOutput();
});
