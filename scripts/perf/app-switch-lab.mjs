#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
/**
 * App-switch lab for the one-origin super-app rollout
 * (docs: platform/architecture/one-origin-super-app#lab).
 *
 *   switch  Click a link from one app to another and time click -> ready.
 *   ttfb    Time to response headers for one or more URLs (gate W1).
 *
 * Run on a Studio host through `ttr resources run`, never on the M4.
 * Signed-in runs take a Playwright storage-state file produced out of band
 * for a synthetic account. The script never accepts or stores credentials.
 *
 * Examples:
 *   node scripts/perf/app-switch-lab.mjs switch \
 *     --from https://tuturuuu.com/personal --link 'a[href*="meet"]' \
 *     --runs 30 --throttle slow4g --storage-state /secure/state.json
 *   node scripts/perf/app-switch-lab.mjs ttfb \
 *     --urls https://tuturuuu.com/,https://one-origin-staging.tuturuuu.com/
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Chrome DevTools "Slow 4G"-like profile: 150 ms RTT, 1.6/0.75 Mbps. */
export const THROTTLE_PROFILES = {
  none: null,
  slow4g: {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  },
};

export function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const options = { mode, runs: 10, throttle: 'none', warm: false };
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    const value = rest[index + 1];
    const take = () => {
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${flag} needs a value`);
      index++;
      return value;
    };
    switch (flag) {
      case '--from':
        options.from = take();
        break;
      case '--link':
        options.link = take();
        break;
      case '--ready-selector':
        options.readySelector = take();
        break;
      case '--runs':
        options.runs = Number.parseInt(take(), 10);
        break;
      case '--throttle':
        options.throttle = take();
        break;
      case '--storage-state':
        options.storageState = take();
        break;
      case '--urls':
        options.urls = take().split(',').filter(Boolean);
        break;
      case '--out':
        options.out = take();
        break;
      case '--timeout':
        options.timeoutMs = Number.parseInt(take(), 10);
        break;
      case '--warm':
        options.warm = true;
        break;
      default:
        throw new Error(`Unknown flag ${flag}`);
    }
  }
  if (!['switch', 'ttfb'].includes(options.mode))
    throw new Error('Mode must be "switch" or "ttfb"');
  if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 200)
    throw new Error('--runs must be between 1 and 200');
  if (!(options.throttle in THROTTLE_PROFILES))
    throw new Error(
      `--throttle must be one of ${Object.keys(THROTTLE_PROFILES)}`
    );
  if (options.mode === 'switch' && (!options.from || !options.link))
    throw new Error('switch needs --from and --link');
  if (options.mode === 'ttfb' && !options.urls?.length)
    throw new Error('ttfb needs --urls');
  return options;
}

/** Nearest-rank percentiles over finite samples. */
export function summarize(samples) {
  const sorted = samples.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p) =>
    sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
      : null;
  return {
    n: sorted.length,
    p50: at(0.5),
    p75: at(0.75),
    p95: at(0.95),
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
  };
}

function loadChromium() {
  const require = createRequire(join(ROOT, 'apps/web/package.json'));
  return require('@playwright/test').chromium;
}

/** How long to wait for `ttr:app-ready` after load before using load. */
const MARK_GRACE_MS = 3_000;

async function waitForReady(page, readySelector, timeoutMs) {
  // `ttr:app-ready` comes from the app's switch tracker; a selector, or the
  // load event plus a grace period, stands in on builds without it.
  const mark = page
    .waitForFunction(
      () => performance.getEntriesByName('ttr:app-ready').length > 0,
      undefined,
      { polling: 'raf', timeout: timeoutMs }
    )
    .then(() => ({ readyBy: 'mark', at: performance.now() }));
  mark.catch(() => {});
  if (readySelector) {
    const selector = page
      .locator(readySelector)
      .first()
      .waitFor({ timeout: timeoutMs })
      .then(() => ({ readyBy: 'selector', at: performance.now() }));
    selector.catch(() => {});
    return Promise.any([mark, selector]);
  }
  await page.waitForLoadState('load', { timeout: timeoutMs });
  const loaded = { readyBy: 'load', at: performance.now() };
  let timer;
  const grace = new Promise((resolve) => {
    timer = setTimeout(() => resolve(loaded), MARK_GRACE_MS);
  });
  try {
    return await Promise.race([mark, grace]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runSwitch(options, chromium = loadChromium()) {
  const browser = await chromium.launch();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const runs = [];
  let context = null;
  try {
    for (let run = 0; run < options.runs; run++) {
      if (!context || !options.warm)
        context = await browser.newContext(
          options.storageState ? { storageState: options.storageState } : {}
        );
      const page = await context.newPage();
      const profile = THROTTLE_PROFILES[options.throttle];
      if (profile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', profile);
      }
      await page.goto(options.from, { waitUntil: 'load', timeout: timeoutMs });
      const link = page.locator(options.link).first();
      await link.waitFor({ timeout: timeoutMs });
      const started = performance.now();
      await link.click({ noWaitAfter: true });
      await page.waitForURL((url) => url.href !== options.from, {
        timeout: timeoutMs,
        waitUntil: 'commit',
      });
      const ready = await waitForReady(page, options.readySelector, timeoutMs);
      runs.push({
        ms: Math.round(ready.at - started),
        readyBy: ready.readyBy,
        url: new URL(page.url()).origin + new URL(page.url()).pathname,
      });
      await page.close();
      if (!options.warm) await context.close();
    }
  } finally {
    await browser.close();
  }
  return {
    mode: 'switch',
    options: redact(options),
    runs,
    summary: summarize(runs.map((r) => r.ms)),
  };
}

export async function runTtfb(options, fetchImpl = fetch) {
  const results = {};
  for (const url of options.urls) {
    const samples = [];
    for (let run = 0; run < options.runs; run++) {
      const started = performance.now();
      const response = await fetchImpl(url, {
        redirect: 'manual',
        headers: { 'cache-control': 'no-cache' },
      });
      samples.push(Math.round(performance.now() - started));
      await response.body?.cancel();
    }
    results[url] = summarize(samples);
  }
  return { mode: 'ttfb', options: redact(options), results };
}

function redact(options) {
  // The storage-state path is local; never echo it into shared reports.
  const { storageState, ...rest } = options;
  return { ...rest, signedIn: Boolean(storageState) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report =
    options.mode === 'switch'
      ? await runSwitch(options)
      : await runTtfb(options);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) await writeFile(options.out, text);
  process.stdout.write(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
