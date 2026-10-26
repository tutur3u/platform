import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const app = resolve(root, 'apps/calendar');
const sha = process.env.SOURCE_SHA;
assert.match(sha ?? '', /^[a-f0-9]{40}$/u);
const { validateOutput, verify } = await import(
  new URL(`file://${root}/scripts/ci/calendar-native-artifact.mjs`)
);
const receipt = JSON.parse(await readFile(join(app, 'calendar-artifact.json')));
verify(app, receipt, sha);
const output = validateOutput(app, sha);
const { unstable_startWorker } = createRequire(join(app, 'package.json'))(
  'wrangler'
);
const { chromium } = createRequire(join(root, 'apps/web/package.json'))(
  'playwright'
);
const scratch = await mkdtemp(join(tmpdir(), 'calendar-offline-browser-'));
await cp(join(app, 'dist'), join(scratch, 'dist'), { recursive: true });
await writeFile(join(scratch, 'empty.env'), '');
const denied = [];
const errors = [];
const violations = [];
const failed = [];
const origin = 'https://calendar.tuturuuu.com';
let documents = 0;
let browser;
const worker = await unstable_startWorker({
  config: join(scratch, relative(app, output.configPath)),
  envFiles: [join(scratch, 'empty.env')],
  sendMetrics: false,
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
    origin: { hostname: 'calendar.tuturuuu.com', secure: true },
    inferOriginFromRoutes: false,
    routeRequestsByRoutes: false,
    auth: () => {
      throw new Error('Provider authentication forbidden');
    },
    outboundService: async (request) => {
      denied.push(`${request.method} ${new URL(request.url).pathname}`);
      return new Response('Unexpected egress', { status: 599 });
    },
  },
});
try {
  await worker.ready;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', async (route) => {
    try {
      const request = route.request();
      const url = new URL(request.url());
      assert.equal(url.origin, origin, 'No public network fallback');
      const response = await worker.fetch(url.href, { redirect: 'manual' });
      if (url.pathname === '/offline.html') {
        documents += 1;
        assert.equal(response.status, 200);
        const csp = response.headers.get('Content-Security-Policy');
        assert.match(csp, /script-src 'self'/u);
        assert.doesNotMatch(csp, /nonce-|strict-dynamic/u);
        assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
      }
      const headers = Object.fromEntries(response.headers);
      const body = Buffer.from(await response.arrayBuffer());
      delete headers['content-length'];
      delete headers['content-encoding'];
      await route.fulfill({ status: response.status, headers, body });
    } catch (error) {
      errors.push(error.message);
      await route.abort();
    }
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.addEventListener('securitypolicyviolation', (event) => {
      console.error(`OFFLINE_CSP_VIOLATION ${event.violatedDirective}`);
    });
  });
  page.on('console', (message) => {
    if (message.text().includes('OFFLINE_CSP_VIOLATION'))
      violations.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() !== 200)
      failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${origin}/offline.html`, { waitUntil: 'load' });
  assert.equal(await page.locator('h1').innerText(), "You're offline");
  assert.equal(documents, 1);
  await Promise.all([
    page.waitForEvent('load', { timeout: 10_000 }),
    page.locator('#retry').click(),
  ]);
  assert.equal(documents, 2, 'Retry reloads the actual sealed fallback');
  assert.deepEqual(violations, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.deepEqual(denied, []);
  if (process.env.BROWSER_EVIDENCE_DIR) {
    await mkdir(process.env.BROWSER_EVIDENCE_DIR, { recursive: true });
    await page.screenshot({
      path: join(
        process.env.BROWSER_EVIDENCE_DIR,
        'calendar-offline-retry.png'
      ),
    });
  }
  verify(app, receipt, sha);
  console.log('CALENDAR_OFFLINE_RETRY_BROWSER_PASS', sha);
} finally {
  await browser?.close();
  await worker.dispose();
  await rm(scratch, { recursive: true });
}
