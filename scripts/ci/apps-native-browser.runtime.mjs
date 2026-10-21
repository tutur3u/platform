import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyNativeBrowserNavigation } from '../../apps/apps/cloudflare/native-browser-navigation.mjs';
import { browserEgress } from '../../apps/apps/cloudflare/native-runtime-fence.mjs';
import { exerciseAppsSessions } from './apps-native-runtime.mjs';
import {
  launchAppsAcceptance,
  readAppsChildPlan,
} from './apps-native-runtime-launcher.mjs';

const app = fileURLToPath(new URL('../../apps/apps/', import.meta.url));
const browserRequire = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);
const fixtures = JSON.parse(
  readFileSync(resolve(app, 'cloudflare/native-route-fixtures.json'), 'utf8')
);

test('ordinary catalogue anchors retain every query contract through the emitted Worker', {
  timeout: 240000,
}, async (t) => {
  assert.equal(process.env.CI, 'true');
  assert.match(process.env.APPS_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
  assert.ok(
    process.env.APPS_ARTIFACT_RECEIPT,
    'Require the actual sealed artifact receipt'
  );
  if (!process.env.NATIVE_FIXTURE_CASE)
    return launchAppsAcceptance(
      fileURLToPath(import.meta.url),
      'browser',
      process.env.APPS_SOURCE_SHA,
      process.env.APPS_ARTIFACT_RECEIPT
    );
  const { plan, prepared, receiptFile } = await readAppsChildPlan('browser');
  const policy = browserEgress();
  const unexpected = policy.unexpected;
  const secret = randomBytes(32).toString('hex');
  const bindings = {
    TUTURUUU_NOINDEX: '1',
    TUTURUUU_APP_COORDINATION_SECRET: secret,
    SUPABASE_SECRET_KEY: 'disposable-unused-fixture',
    NEXT_PUBLIC_SUPABASE_URL: 'https://apps-ci.supabase.invalid',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_apps_ci_placeholder',
  };
  await exerciseAppsSessions(
    plan,
    prepared,
    { app: policy },
    bindings,
    async (workers, completed) => {
      const runtime = workers.app;
      const origin = (await runtime.url).origin;
      const canonical = await runtime.fetch('https://apps.tuturuuu.com/', {
        redirect: 'manual',
      });
      assert.equal(
        canonical.status,
        503,
        'Staging must reject canonical-host activation'
      );
      assert.match(canonical.headers.get('x-robots-tag') ?? '', /noindex/);
      completed('canonical');
      const html = await runtime.fetch(origin);
      assert.equal(html.status, 200);
      assert.match(html.headers.get('x-robots-tag') ?? '', /noindex/);
      assert.match(html.headers.get('cache-control') ?? '', /no-store/);
      completed('catalogue');
      const info = await runtime.fetch(new URL('/api/build-info', origin).href);
      assert.equal(info.status, 200);
      assert.equal(
        (await info.json()).commitHash,
        process.env.APPS_SOURCE_SHA,
        'Build identity must come from compiled metadata, without a runtime SHA override'
      );
      completed('build');
      const { chromium } = browserRequire('playwright');
      const browser = await chromium.launch({ headless: true });
      let browserPrimary;
      try {
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
        completed('anchors');
        assert.equal(
          unexpected.length,
          0,
          'Unexpected fixture egress must remain zero'
        );
        completed('egress');
        const listenerRedirect = await fetch(
          `${origin}/vi/meet/a%2Fb?tag=1&tag=2`,
          { redirect: 'manual', signal: t.signal }
        );
        assert.equal(listenerRedirect.status, 307);
        assert.equal(
          listenerRedirect.headers.get('location'),
          `${origin}/meet/a%2Fb?tag=1&tag=2`
        );
        completed('listenerOrigin');
      } catch (error) {
        browserPrimary = error;
      }
      try {
        await browser.close();
      } catch (error) {
        throw new AggregateError(
          [browserPrimary, error].filter(Boolean),
          'Browser closure failed'
        );
      }
      if (browserPrimary) throw browserPrimary;
    },
    receiptFile
  );
});
