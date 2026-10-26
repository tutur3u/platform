#!/usr/bin/env node
// Signed-in native root-browser gate. Starts the app's restored, sealed
// Worker artifact in local workerd with a disposable fixture session, answers
// all Supabase and Web egress in-process, and checks each profile locale:
// the signed-in SSR redirect chain stays in the app and ends on a 200 page in
// that locale, then Chromium loads it and the client hydrates with no page
// errors, failed assets or unexpected egress. Never targets a hosted URL.
//
//   node scripts/ci/native-root-browser.mjs <app> --receipt <restored-receipt.json> [--sha <40-hex>]
//
// The app's profile lives at apps/<app>/cloudflare/root-browser.profile.mjs.
// See "Signed-in root browser gate" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { readNativeRuntimeConfig } from './apps-native-runtime-pointer.mjs';
import {
  assertLoopbackOrigin,
  browserDecision,
  createWorkerEgress,
  profileProblems,
  sessionCookies,
  ssrProblems,
} from './native-root-browser-core.mjs';

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const root = resolve(new URL('../..', import.meta.url).pathname);
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { receipt: { type: 'string' }, sha: { type: 'string' } },
});
const [app] = positionals;
const appDir = resolve(root, 'apps', app ?? '');
const { default: profile } = await import(
  pathToFileURL(join(appDir, 'cloudflare/root-browser.profile.mjs')).href
);
const problems = profileProblems(app, profile);
assert.deepEqual(problems, [], `invalid ${app} root-browser profile`);
const envSha = `${app.replace(/-/gu, '_').toUpperCase()}_SOURCE_SHA`;
const sha = values.sha ?? process.env[envSha];
assert.match(sha ?? '', /^[a-f0-9]{40}$/u, `pass --sha or set ${envSha}`);
assert.ok(values.receipt, 'pass --receipt <restored artifact receipt>');

const verify = () =>
  execFileSync(
    'python3',
    [
      `scripts/ci/${app}-native-artifact.py`,
      'verify',
      `apps/${app}`,
      '--receipt',
      resolve(values.receipt),
    ],
    { cwd: root, stdio: 'inherit', env: { ...process.env, [envSha]: sha } }
  );
verify();

const context = {
  actorId: randomUUID(),
  wsId: randomUUID(),
  supabaseUrl: `https://${app}-ci.supabase.invalid`,
};
const secret = randomBytes(32).toString('hex');
const cookies = sessionCookies(app, profile, { ...context, secret });
const egress = createWorkerEgress(profile, context);
const { configPath } = readNativeRuntimeConfig(appDir);
const { unstable_startWorker } = createRequire(join(appDir, 'package.json'))(
  'wrangler'
);
const { chromium } = createRequire(resolve(root, 'apps/web/package.json'))(
  'playwright'
);
const image = resolve(root, 'apps/web/public/media/logos/transparent.png');
const scratch = await mkdtemp(join(tmpdir(), `${app}-root-browser-`));
await cp(join(appDir, 'dist'), join(scratch, 'dist'), { recursive: true });
await writeFile(join(scratch, 'empty.env'), '');

const worker = await unstable_startWorker({
  config: join(scratch, relative(appDir, configPath)),
  envFiles: [join(scratch, 'empty.env')],
  sendMetrics: false,
  bindings: {
    TUTURUUU_APP_COORDINATION_SECRET: { type: 'secret_text', value: secret },
    SUPABASE_SECRET_KEY: {
      type: 'secret_text',
      value: 'disposable_root_browser_fixture_only',
    },
    NEXT_PUBLIC_SUPABASE_URL: {
      type: 'plain_text',
      value: context.supabaseUrl,
    },
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
      type: 'plain_text',
      value: `sb_publishable_${app}_ci_placeholder`,
    },
    NEXT_PUBLIC_WEB_APP_URL: {
      type: 'plain_text',
      value: 'https://tuturuuu.com',
    },
    NEXT_PUBLIC_APP_URL: {
      type: 'plain_text',
      value: `https://${profile.rootHost}`,
    },
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
    registry: join(scratch, 'registry'),
    server: { hostname: '127.0.0.1', port: 0 },
    origin: { hostname: profile.rootHost, secure: true },
    inferOriginFromRoutes: false,
    routeRequestsByRoutes: false,
    auth: () => {
      throw new Error(
        'Provider authentication is forbidden in the root-browser gate'
      );
    },
    outboundService: (request) => egress.handle(request),
  },
});

const pageErrors = [];
const failedAssets = [];
const browserUnexpected = [];
let browser;
try {
  await worker.ready;
  const origin = assertLoopbackOrigin((await worker.url).origin);
  const canonical = `https://${profile.rootHost}`;
  const identity = await worker.fetch(`${canonical}/api/build-info`);
  assert.equal(identity.status, 200, 'build-info');
  assert.equal((await identity.json()).commitHash, sha, 'build identity');

  browser = await chromium.launch({ headless: true });
  for (const entry of profile.locales) {
    const cookieMap = {
      ...Object.fromEntries(cookies),
      ...(entry.cookies ?? {}),
    };
    const header = Object.entries(cookieMap)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const chain = [entry.path];
    let url = new URL(entry.path, canonical);
    let response = await worker.fetch(url.href, {
      redirect: 'manual',
      headers: { 'accept-language': entry.locale, cookie: header },
    });
    for (let step = 0; step < 4 && REDIRECTS.has(response.status); step++) {
      url = new URL(response.headers.get('location'), url);
      chain.push(`${response.status} ${url.pathname}${url.search}`);
      assert.equal(
        url.origin,
        canonical,
        `signed-in ${entry.locale} root left the app: ${chain.join(' -> ')}`
      );
      response = await worker.fetch(url.href, {
        redirect: 'manual',
        headers: { 'accept-language': entry.locale, cookie: header },
      });
    }
    const html = await response.text();
    const ssr = ssrProblems(response, html, {
      locale: entry.locale,
      robots: profile.robots,
    });
    assert.deepEqual(
      ssr,
      [],
      `${entry.locale} SSR (${chain.join(' -> ')}): ${html.slice(0, 400)}`
    );
    assert.match(url.pathname, entry.finalPath, `${entry.locale} final path`);

    const browserContext = await browser.newContext({ locale: entry.locale });
    await browserContext.addCookies(
      Object.entries(cookieMap).map(([name, value]) => ({
        name,
        value,
        url: origin,
        httpOnly: name.startsWith('tuturuuu_'),
        sameSite: 'Lax',
      }))
    );
    await browserContext.route('**/*', (route) => {
      const decision = browserDecision(
        profile,
        origin,
        route.request().method(),
        route.request().url()
      );
      if (decision.action === 'continue') return route.continue();
      if (decision.action === 'abort') {
        browserUnexpected.push(decision.label);
        return route.abort();
      }
      return decision.fulfill === 401
        ? route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: '{"error":"Unauthorized fixture"}',
          })
        : route.fulfill({ status: 200, contentType: 'image/png', path: image });
    });
    const page = await browserContext.newPage();
    page.on('pageerror', (error) =>
      pageErrors.push(`${entry.locale}: ${error.message}`)
    );
    page.on('response', (asset) => {
      if (
        new URL(asset.url()).pathname.startsWith('/assets/') &&
        asset.status() !== 200
      )
        failedAssets.push(asset.url());
    });
    const hydrationContext = { ...context, locale: entry.locale, appDir };
    // Polling pages never reach network idle: hydration is the client's own
    // request for the fixture data, or a marker only the client renders.
    const hydrated = profile.hydration.request
      ? page.waitForResponse(
          (candidate) =>
            new URL(candidate.url()).pathname.startsWith(
              profile.hydration.request(hydrationContext)
            ),
          { timeout: 60000 }
        )
      : null;
    await page.goto(`${origin}${entry.path}`, {
      waitUntil: 'load',
      timeout: 60000,
    });
    if (hydrated) await hydrated;
    if (profile.hydration.text)
      await page
        .getByText(await profile.hydration.text(hydrationContext), {
          exact: true,
        })
        .first()
        .waitFor({ timeout: 60000 });
    assert.equal(await page.locator('html').getAttribute('lang'), entry.locale);
    assert.match(
      new URL(page.url()).pathname,
      entry.finalPath,
      `${entry.locale} browser path`
    );
    console.log(
      `PASS ${app} ${entry.locale}: ${chain.join(' -> ')} -> 200, lang=${entry.locale}, title="${await page.title()}", hydrated`
    );
    await browserContext.close();
  }
  console.log(
    `fixture-answered egress:\n  ${[...new Set(egress.seen)].join('\n  ')}`
  );
  assert.deepEqual(pageErrors, [], 'browser page errors');
  assert.deepEqual(failedAssets, [], 'failed emitted assets');
  assert.deepEqual(
    [...egress.unexpected, ...browserUnexpected],
    [],
    'unexpected egress'
  );
  verify();
  console.log(`ROOT_BROWSER_PASS ${app} ${sha}`);
} finally {
  if (browser) await browser.close();
  await worker.dispose();
  await rm(scratch, { recursive: true, force: true });
}
