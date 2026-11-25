// Shell performance benchmark against a deployed origin (read-only).
//
//   ttr qa users session <user-id> --origin https://tuturuuu.com \
//     --format storage-state --out state.json
//   node apps/web/e2e/perf/shell-benchmark.mjs state.json out.json \
//     https://tuturuuu.com 3
//
// BENCH_APPS / BENCH_SWITCH override the app lists (comma separated).
// Measures cold loads, app-to-app switches, back/forward cache, shared
// script reuse and theme toggles through the real account menu. See
// apps/docs/build/devops/shell-performance.mdx for the baseline.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [stateFile, outFile, origin = 'https://tuturuuu.com', runsArg = '3'] =
  process.argv.slice(2);
const RUNS = Number(runsArg);
const APPS = (
  process.env.BENCH_APPS ??
  'mail,calendar,tasks,drive,finance,chat,meet,personal'
).split(',');
const SWITCH = (
  process.env.BENCH_SWITCH ?? 'mail,calendar,tasks,mail,calendar,tasks'
).split(',');

const OBSERVER = () => {
  window.__bench = { lcp: 0, cls: 0, shifts: [], events: [] };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__bench.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__bench.shifts.push({
          t: e.startTime,
          v: e.value,
          input: e.hadRecentInput,
        });
        if (!e.hadRecentInput) window.__bench.cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__bench.events.push({
          name: e.name,
          t: e.startTime,
          d: e.duration,
          id: e.interactionId,
        });
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {}
};

function median(xs) {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

async function instrument(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Page.enable');
  const reqs = new Map();
  const log = { reqs, bfcache: [] };
  cdp.on('Network.requestWillBeSent', (e) => {
    reqs.set(e.requestId, {
      url: e.request.url,
      type: e.type,
      bytes: 0,
      cached: false,
      status: 0,
      t: Date.now(),
    });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId);
    if (!r) return;
    r.status = e.response.status;
    r.cached =
      e.response.fromDiskCache ||
      e.response.fromPrefetchCache ||
      e.response.fromServiceWorker;
    r.cacheControl =
      e.response.headers['cache-control'] ??
      e.response.headers['Cache-Control'];
    r.type = e.type;
  });
  cdp.on('Network.requestServedFromCache', (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.cached = true;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  cdp.on('Page.backForwardCacheNotUsed', (e) => log.bfcache.push(e));
  return log;
}

function summarize(reqList) {
  const js = reqList.filter((r) => r.type === 'Script');
  const css = reqList.filter((r) => r.type === 'Stylesheet');
  return {
    requests: reqList.length,
    documents: reqList.filter((r) => r.type === 'Document').length,
    jsRequests: js.length,
    jsCached: js.filter((r) => r.cached).length,
    jsKB: Math.round(
      js.filter((r) => !r.cached).reduce((a, r) => a + r.bytes, 0) / 1024
    ),
    cssKB: Math.round(
      css.filter((r) => !r.cached).reduce((a, r) => a + r.bytes, 0) / 1024
    ),
    totalKB: Math.round(
      reqList.filter((r) => !r.cached).reduce((a, r) => a + r.bytes, 0) / 1024
    ),
  };
}

async function measureNav(page, log, url) {
  const before = new Set(log.reqs.keys());
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      finalUrl: location.pathname,
      navType: n?.type,
      ttfb: Math.round(n?.responseStart ?? 0),
      fcp: Math.round(fcp?.startTime ?? 0),
      dcl: Math.round(n?.domContentLoadedEventEnd ?? 0),
      load: Math.round(n?.loadEventEnd ?? 0),
      lcp: Math.round(window.__bench?.lcp ?? 0),
      cls: Number((window.__bench?.cls ?? 0).toFixed(4)),
      speculationRules: document.querySelectorAll(
        'script[type=speculationrules]'
      ).length,
      viewTransitionCss: [...document.styleSheets].some((s) => {
        try {
          return [...s.cssRules].some((r) =>
            r.cssText.includes('view-transition')
          );
        } catch {
          return false;
        }
      }),
      htmlClass: document.documentElement.className,
    };
  });
  const fresh = [...log.reqs.entries()]
    .filter(([k]) => !before.has(k))
    .map(([, v]) => v);
  const doc = fresh.find((r) => r.type === 'Document' && r.status === 200);
  return {
    ...m,
    ...summarize(fresh),
    docCacheControl: doc?.cacheControl,
    scripts: fresh.filter((r) => r.type === 'Script').map((r) => r.url),
  };
}

async function newCtx(browser) {
  const ctx = await browser.newContext({
    storageState: stateFile,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  });
  await ctx.addInitScript(OBSERVER);
  return ctx;
}

async function dismissDialogs(page) {
  const save = page
    .getByRole('dialog')
    .getByRole('button', { name: /save settings/i });
  if (await save.count()) {
    await save.click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  for (let i = 0; i < 2; i++)
    await page.keyboard.press('Escape').catch(() => {});
  await page
    .getByRole('dialog')
    .waitFor({ state: 'detached', timeout: 5000 })
    .catch(() => {});
}

async function themeToggle(page, log, target) {
  await dismissDialogs(page);
  for (let i = 0; i < 3 && (await page.getByRole('menu').count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // Shared satellite account menu lives at the sidebar bottom.
  const t = page
    .locator('button[aria-haspopup=menu]')
    .filter({ hasText: /No name/ })
    .last();
  await t.click({ timeout: 10000 });
  const item = page.getByRole('menuitem', {
    name: new RegExp(`^${target}$`, 'i'),
  });
  if (!(await item.isVisible().catch(() => false))) {
    const sub = page.getByRole('menuitem', { name: /^(theme|giao diện)$/i });
    await sub.focus({ timeout: 10000 });
    await page.keyboard.press('ArrowRight');
  }
  await item.waitFor({ timeout: 10000 });
  const before = new Set(log.reqs.keys());
  const domBefore = await page.evaluate(() => {
    window.__mut = 0;
    window.__mo = new MutationObserver((ms) => {
      for (const m of ms)
        window.__mut += m.addedNodes.length + m.removedNodes.length;
    });
    window.__mo.observe(document.body, { childList: true, subtree: true });
    window.__bench.shifts = [];
    window.__bench.events = [];
    window.__t0 = performance.now();
    window.__themeAt = 0;
    const mo = new MutationObserver(() => {
      if (
        !window.__themeAt &&
        document.documentElement.classList.contains(window.__wantTheme)
      ) {
        window.__themeAt = performance.now();
        requestAnimationFrame(() =>
          setTimeout(() => {
            window.__paintAt = performance.now();
            const tr = document
              .getAnimations()
              .filter((a) => a.constructor.name === 'CSSTransition');
            window.__transitions = tr.length;
            window.__settleMs = Math.round(
              Math.max(
                0,
                ...tr.map((a) => a.effect.getComputedTiming().endTime)
              )
            );
          }, 0)
        );
      }
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    });
    return document.querySelectorAll('*').length;
  });
  await page.evaluate((w) => {
    window.__wantTheme = w;
  }, target.toLowerCase());
  const clickAt = Date.now();
  await item.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const ev = window.__bench.events.filter((e) => e.t >= window.__t0);
    const inp = Math.max(0, ...ev.filter((e) => e.id).map((e) => e.d));
    return {
      classAppliedMs: window.__themeAt
        ? Math.round(window.__themeAt - window.__t0)
        : null,
      paintMs: window.__paintAt
        ? Math.round(window.__paintAt - window.__t0)
        : null,
      interactionMs: Math.round(inp),
      shiftsAll: Number(
        window.__bench.shifts.reduce((a, s) => a + s.v, 0).toFixed(4)
      ),
      domNodesAddedRemoved: window.__mut,
      cssTransitions: window.__transitions ?? null,
      transitionSettleMs: window.__settleMs ?? null,
      htmlClass: document.documentElement.className,
      stored: localStorage.getItem('theme'),
    };
  });
  const fresh = [...log.reqs.entries()]
    .filter(([k]) => !before.has(k))
    .map(([, v]) => v);
  return {
    ...r,
    domNodes: domBefore,
    requests: fresh.length,
    documentRequests: fresh.filter((x) => x.type === 'Document').length,
    requestUrls: fresh.map(
      (x) => `${x.type} ${x.url.replace(origin, '').slice(0, 100)}`
    ),
    wallMs: Date.now() - clickAt,
  };
}

const browser = await chromium.launch();
const out = {
  origin,
  at: new Date().toISOString(),
  runs: RUNS,
  cold: {},
  switch: [],
  theme: {},
  reuse: {},
  bfcache: [],
};

// (c) cold load per app + (d) script content hashes
const hashes = {};
for (const app of APPS) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await newCtx(browser);
    const page = await ctx.newPage();
    const log = await instrument(page);
    if (i === 0) {
      hashes[app] = new Map();
      page.on('response', async (res) => {
        if (res.request().resourceType() !== 'script') return;
        try {
          const b = await res.body();
          hashes[app].set(res.url(), {
            h: createHash('sha256').update(b).digest('hex').slice(0, 16),
            n: b.length,
          });
        } catch {}
      });
    }
    try {
      runs.push(await measureNav(page, log, `${origin}/${app}`));
    } catch (e) {
      runs.push({ error: String(e).slice(0, 200) });
    }
    await ctx.close();
  }
  const ok = runs.filter((r) => !r.error);
  const pick = (k) => median(ok.map((r) => r[k]));
  out.cold[app] = {
    finalUrl: ok[0]?.finalUrl,
    docCacheControl: ok[0]?.docCacheControl,
    speculationRules: ok[0]?.speculationRules,
    ttfb: pick('ttfb'),
    fcp: pick('fcp'),
    lcp: pick('lcp'),
    load: pick('load'),
    cls: pick('cls'),
    documents: pick('documents'),
    jsRequests: pick('jsRequests'),
    jsKB: pick('jsKB'),
    cssKB: pick('cssKB'),
    totalKB: pick('totalKB'),
    errors: runs.filter((r) => r.error).map((r) => r.error),
  };
  console.error('cold', app, JSON.stringify(out.cold[app]));
}

// (d) chunk reuse across apps
const byHash = new Map();
for (const [app, m] of Object.entries(hashes))
  for (const [url, { h, n }] of m) {
    if (!byHash.has(h)) byHash.set(h, { n, urls: new Set(), apps: new Set() });
    const e = byHash.get(h);
    e.urls.add(new URL(url).pathname.replace(/[^/]+$/, ''));
    e.apps.add(app);
  }
let sharedSameUrl = 0,
  sharedDiffUrl = 0,
  uniq = 0;
for (const e of byHash.values()) {
  const extra = (e.apps.size - 1) * e.n;
  if (e.apps.size < 2) uniq += e.n;
  else if (e.urls.size === 1) sharedSameUrl += extra;
  else sharedDiffUrl += extra;
}
out.reuse = {
  distinctScripts: byHash.size,
  identicalContentDifferentUrlKB: Math.round(sharedDiffUrl / 1024),
  identicalContentSameUrlKB: Math.round(sharedSameUrl / 1024),
  appUniqueKB: Math.round(uniq / 1024),
  scriptPrefixes: Object.fromEntries(
    Object.entries(hashes).map(([a, m]) => [
      a,
      [
        ...new Set(
          [...m.keys()].map((u) =>
            new URL(u).pathname.split('/').slice(0, 3).join('/')
          )
        ),
      ],
    ])
  ),
};
console.error('reuse', JSON.stringify(out.reuse));

// (b) app-to-app switch in one warm context, then back/forward
{
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  const log = await instrument(page);
  for (const app of SWITCH) {
    try {
      const m = await measureNav(page, log, `${origin}/${app}`);
      delete m.scripts;
      out.switch.push({ app, ...m });
      console.error('switch', app, JSON.stringify(m));
    } catch (e) {
      out.switch.push({ app, error: String(e).slice(0, 200) });
    }
  }
  const nb = log.bfcache.length;
  const t0 = Date.now();
  await page.goBack({ waitUntil: 'load' }).catch(() => {});
  const back = await page.evaluate(
    () => performance.getEntriesByType('navigation')[0]?.type
  );
  out.bfcache.push({
    backMs: Date.now() - t0,
    restoredFromBfcache: log.bfcache.length === nb,
    notUsed: log.bfcache.slice(nb).map((e) => ({
      type: e.notRestoredExplanations?.map((x) => `${x.type}:${x.reason}`),
    })),
    navType: back,
  });
  console.error('bfcache', JSON.stringify(out.bfcache));

  // (a) theme toggle on each switch app
  for (const app of [...new Set(SWITCH)]) {
    await page.goto(`${origin}/${app}`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      for (const target of ['Dark', 'Light']) {
        try {
          samples.push({ target, ...(await themeToggle(page, log, target)) });
        } catch (e) {
          samples.push({ target, error: String(e).slice(0, 300) });
          if (process.env.SHOTS) {
            await page
              .screenshot({
                path: `${process.env.SHOTS}/fail-${app}-${target}.png`,
              })
              .catch(() => {});
          }
          await page.keyboard.press('Escape');
        }
      }
    }
    const ok = samples.filter((s) => !s.error);
    out.theme[app] = {
      classAppliedMs: median(ok.map((s) => s.classAppliedMs)),
      paintMs: median(ok.map((s) => s.paintMs)),
      interactionMs: median(ok.map((s) => s.interactionMs)),
      maxInteractionMs: Math.max(0, ...ok.map((s) => s.interactionMs)),
      requests: median(ok.map((s) => s.requests)),
      documentRequests: Math.max(0, ...ok.map((s) => s.documentRequests)),
      shifts: Math.max(0, ...ok.map((s) => s.shiftsAll)),
      cssTransitions: median(ok.map((s) => s.cssTransitions)),
      transitionSettleMs: median(ok.map((s) => s.transitionSettleMs)),
      domNodesAddedRemoved: median(ok.map((s) => s.domNodesAddedRemoved)),
      domNodes: ok[0]?.domNodes,
      sampleRequestUrls: ok[0]?.requestUrls,
      stored: ok.at(-1)?.stored,
      errors: samples.filter((s) => s.error).map((s) => s.error),
    };
    console.error('theme', app, JSON.stringify(out.theme[app]));
  }
  await ctx.close();
}

await browser.close();
writeFileSync(outFile, JSON.stringify(out, null, 2));
