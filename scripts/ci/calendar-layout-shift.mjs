#!/usr/bin/env node
/**
 * Headless layout-shift check for the calendar's first paint.
 *
 * Mounts the real CalendarContent (header, weekday bar, loading skeletons and
 * time grid) with static fixtures through Vite. The page first paints the
 * tree's server markup, then hydrates it, like a server-rendered route. The
 * check records the cumulative Layout Instability score, the grid and header
 * boxes from first paint to the resolved calendar, and paint timings, at a
 * desktop and a phone viewport.
 *
 *   node scripts/ci/calendar-layout-shift.mjs
 *
 * Fails when the layout-shift total exceeds CALENDAR_SHIFT_MAX_CLS (default
 * 0.01) or the grid box moves or resizes by more than CALENDAR_SHIFT_MAX_MOVE
 * pixels (default 1) between first paint and the resolved calendar.
 *
 * Environment: CALENDAR_SHIFT_PORT (default 4193), CALENDAR_SHIFT_OUT (JSON
 * evidence path), CALENDAR_SHIFT_SHOTS (directory for first-paint and resolved
 * screenshots in light and dark), CALENDAR_SHIFT_NO_ASSERT=1 to print numbers
 * without failing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = import.meta.dirname;
const repo = path.resolve(here, '../..');
const harness = path.join(repo, 'packages/ui/tests/calendar-layout-shift');
const fixtures = path.join(harness, 'fixtures.tsx');
const port = Number(process.env.CALENDAR_SHIFT_PORT ?? 4193);
const maxCls = Number(process.env.CALENDAR_SHIFT_MAX_CLS ?? 0.01);
const maxMove = Number(process.env.CALENDAR_SHIFT_MAX_MOVE ?? 1);
const outPath =
  process.env.CALENDAR_SHIFT_OUT ??
  path.join(os.tmpdir(), `calendar-layout-shift-${process.pid}.json`);
const shots = process.env.CALENDAR_SHIFT_SHOTS;
const noAssert = process.env.CALENDAR_SHIFT_NO_ASSERT === '1';
/** How long to watch after navigation; covers hydration and data loading. */
const SETTLE_MS = 2500;
const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'phone-390', width: 390, height: 844 },
];

// Tooling lives in app workspaces rather than the repo root, so resolve each
// dependency from the first workspace that declares it.
const toolingRoots = [
  'apps/calendar',
  'apps/web',
  'apps/workspace',
  'apps/learn',
];
function requireFromWorkspace(id) {
  for (const root of toolingRoots) {
    try {
      return createRequire(path.join(repo, root, 'package.json')).resolve(id);
    } catch {}
  }
  throw new Error(`Cannot resolve ${id} from ${toolingRoots.join(', ')}`);
}
const { createServer } = await import(requireFromWorkspace('vite'));
const react = (await import(requireFromWorkspace('@vitejs/plugin-react')))
  .default;
const tailwind = (await import(requireFromWorkspace('@tailwindcss/postcss')))
  .default;
const playwright = require(requireFromWorkspace('playwright'));
const chromium = playwright.chromium ?? playwright.default?.chromium;
const useIntl = requireFromWorkspace('use-intl');
const reactQuery = path.dirname(
  createRequire(path.join(repo, 'packages/tasks-ui/package.json')).resolve(
    '@tanstack/react-query/package.json'
  )
);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Maps workspace package exports to their TypeScript sources. */
function sourceAliases() {
  const aliases = [];
  for (const namespace of ['ui', 'utils', 'icons', 'types']) {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repo, 'packages', namespace, 'package.json'))
    );
    for (const [key, value] of Object.entries(pkg.exports)) {
      const declared =
        typeof value === 'string' ? value : (value.import ?? value.default);
      if (!declared) continue;
      const target =
        namespace === 'types'
          ? declared.replace(/^\.\/dist\//, './src/').replace(/\.js$/, '.ts')
          : declared;
      const find = `@tuturuuu/${namespace}${key === '.' ? '' : key.slice(1)}`;
      const replacement = path.join(repo, 'packages', namespace, target);
      aliases.push(
        find.includes('*')
          ? {
              find: new RegExp(
                `^${find.split('*').map(escapeRegExp).join('(.+)')}$`
              ),
              replacement: replacement.split('*').join('$1'),
            }
          : { find: new RegExp(`^${escapeRegExp(find)}$`), replacement }
      );
    }
  }
  const pattern = (entry) => entry.find.source;
  return aliases.sort(
    (a, b) =>
      Number(pattern(a).includes('(.+)')) -
        Number(pattern(b).includes('(.+)')) ||
      pattern(b).length - pattern(a).length
  );
}

/**
 * Modules replaced by fixtures.tsx, matched by resolved path so that package
 * and relative imports of the same module both resolve to the fixture.
 */
const FIXTURE_MODULES = new Set(
  [
    'packages/ui/src/hooks/use-calendar.tsx',
    'packages/ui/src/hooks/use-calendar-sync.tsx',
    'packages/ui/src/hooks/use-workspace-visibility.tsx',
    'packages/ui/src/hooks/use-workspace-visibility.ts',
    'packages/ui/src/components/ui/legacy/calendar/event-modal.tsx',
    'packages/ui/src/components/ui/legacy/calendar/event-preview-popover.tsx',
    'packages/ui/src/components/ui/legacy/calendar/native-recurrence-dialog.tsx',
    'packages/tasks-ui/src/calendar/components/quick-task-dialog.tsx',
    'packages/tasks-ui/src/calendar/components/smart-schedule-preview-panel.tsx',
    'packages/tasks-ui/src/tu-do/habits/habit-form-dialog.tsx',
  ].map((file) => path.join(repo, file))
);

/**
 * Workspace packages outside sourceAliases() publish built `dist/` entries,
 * which a fresh checkout does not have. Map an export to its source file: the
 * `bun` condition when declared, otherwise the `dist/*.js` path under `src/`.
 */
function workspaceSource(source) {
  const match = /^@tuturuuu\/([^/]+)(\/.+)?$/.exec(source);
  if (!match) return null;
  const dir = path.join(repo, 'packages', match[1]);
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')));
  } catch {
    return null;
  }
  const value = pkg.exports?.[`.${match[2] ?? ''}`];
  const declared =
    typeof value === 'string'
      ? value
      : (value?.bun ?? value?.import ?? value?.default);
  if (!declared) return null;
  const base = path.join(
    dir,
    declared.replace(/^\.\/dist\//, './src/').replace(/\.js$/, '')
  );
  return (
    [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find(
      (file) => fs.existsSync(file) && fs.statSync(file).isFile()
    ) ?? null
  );
}

const fixturePlugin = {
  name: 'calendar-layout-shift-fixtures',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || importer === fixtures) return null;
    const fromSource = workspaceSource(source);
    if (fromSource)
      return FIXTURE_MODULES.has(fromSource) ? fixtures : fromSource;
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    return resolved && FIXTURE_MODULES.has(resolved.id.split('?')[0])
      ? fixtures
      : null;
  },
};

/** Runs in the page before any script: records shifts, paints and frames. */
function installProbes() {
  window.__shifts = [];
  window.__paints = {};
  window.__frames = [];
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__shifts.push({
        t: Math.round(entry.startTime),
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: entry.sources.map((source) => {
          const node = source.node;
          const slot = node?.getAttribute?.('data-slot');
          const testId = node?.getAttribute?.('data-testid');
          return {
            node: node
              ? `${node.nodeName.toLowerCase()}${slot ? `[${slot}]` : ''}${testId ? `[${testId}]` : ''}`
              : 'detached',
            previous: source.previousRect.toJSON(),
            current: source.currentRect.toJSON(),
          };
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      window.__paints[entry.name] = Math.round(entry.startTime);
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1);
    if (last) window.__paints.lcp = Math.round(last.startTime);
  }).observe({ type: 'largest-contentful-paint', buffered: true });

  // The grid is the calendar body below the header: the skeleton body before
  // the view resolves, then the scrolling time grid or month grid.
  const gridSelector =
    '[data-slot="calendar-body"], [data-testid="calendar-root"] > div > div.overflow-auto';
  const headerSelector =
    '[data-slot="calendar-header"], [data-testid="calendar-header-skeleton"]';
  const box = (el) => {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
  };
  const start = performance.now();
  const tick = () => {
    // performance.now() rather than the rAF timestamp, which can predate a
    // long task that blocked the frame.
    const now = performance.now();
    const root = document.querySelector('[data-testid="calendar-root"]');
    window.__frames.push({
      t: Math.round(now),
      grid: box(document.querySelector(gridSelector)),
      header: box(document.querySelector(headerSelector)),
      placeholder: Boolean(root?.querySelector('[aria-busy="true"]')),
      // Columns hidden by CSS below md have no client rects.
      timeColumns: [
        ...document.querySelectorAll(
          '[data-testid="calendar-skeleton-column"], [data-column-date]'
        ),
      ].filter((column) => column.getClientRects().length > 0).length,
    });
    if (now - start < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const round = (value) =>
  value === null || value === undefined ? null : Number(value.toFixed(2));
const roundBox = (b) =>
  b && {
    x: round(b.x),
    y: round(b.y),
    width: round(b.width),
    height: round(b.height),
  };
function boxDelta(a, b) {
  if (!a || !b) return null;
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.width - b.width),
    Math.abs(a.height - b.height)
  );
}

async function measure(browser, viewport) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(installProbes);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(SETTLE_MS);
  const { shifts, paints, frames, markupAt, hydrateAt } = await page.evaluate(
    () => ({
      shifts: window.__shifts,
      paints: window.__paints,
      frames: window.__frames,
      markupAt: performance.getEntriesByName('calendar-server-markup')[0]
        ?.startTime,
      hydrateAt: performance.getEntriesByName('calendar-hydrate')[0]?.startTime,
    })
  );
  await page.close();

  // First paint is the first frame after the server markup is in the page.
  const firstPaint = frames.find((f) => f.t >= markupAt) ?? null;
  const final = frames.at(-1);
  const firstGrid = frames.find((f) => f.grid) ?? null;
  const resolved = frames.find((f) => f.grid && !f.placeholder) ?? null;
  const gridFrames = frames.filter((f) => f.grid);
  const maxGridMove = Math.max(
    0,
    ...gridFrames.map((f) => boxDelta(f.grid, final.grid) ?? 0)
  );
  const cls = shifts
    .filter((s) => !s.hadRecentInput)
    .reduce((sum, s) => sum + s.value, 0);
  return {
    viewport: `${viewport.width}x${viewport.height}`,
    cls: Number(cls.toFixed(6)),
    gridAtFirstPaint: roundBox(firstPaint?.grid ?? null),
    gridAfterInit: roundBox(final.grid),
    gridMaxMovePx: round(gridFrames.length ? maxGridMove : null),
    headerHeightAtFirstPaint: round(firstPaint?.header?.height ?? null),
    headerHeightAfterInit: round(final.header?.height ?? null),
    timeColumnsAtFirstPaint: firstPaint?.timeColumns ?? 0,
    timeColumnsAfterInit: final.timeColumns,
    firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
    largestContentfulPaintMs: paints.lcp ?? null,
    serverMarkupMs: round(markupAt ?? null),
    hydrateStartMs: round(hydrateAt ?? null),
    gridFirstPaintMs: firstGrid?.t ?? null,
    gridResolvedMs: resolved?.t ?? null,
    layoutShiftEntries: shifts.length,
    shiftSources: shifts.flatMap((s) => s.sources).slice(0, 8),
    pageErrors,
    frames,
  };
}

async function screenshots(browser, viewport) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: theme,
    });
    await page.goto(`http://127.0.0.1:${port}/?theme=${theme}&hold=1`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(shots, `${viewport.name}-${theme}-1-first-paint.png`),
    });
    await page.goto(`http://127.0.0.1:${port}/?theme=${theme}`);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({
      path: path.join(shots, `${viewport.name}-${theme}-2-after-init.png`),
    });
    await page.close();
  }
}

let server;
let browser;
try {
  server = await createServer({
    root: harness,
    configFile: false,
    publicDir: path.join(repo, 'apps/calendar/public'),
    cacheDir: path.join(
      os.tmpdir(),
      `calendar-layout-shift-vite-${process.pid}`
    ),
    plugins: [fixturePlugin, react()],
    // Shared packages read Next.js public env values; none apply here.
    define: { 'process.env.NODE_ENV': '"development"' },
    resolve: {
      alias: [
        { find: /^next-intl$/, replacement: useIntl },
        { find: /^@tanstack\/react-query$/, replacement: reactQuery },
        {
          find: /^@tasks-ui\/(.+)$/,
          replacement: `${path.join(repo, 'packages/tasks-ui/src')}/$1`,
        },
        ...sourceAliases(),
      ],
      dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    },
    css: { postcss: { plugins: [tailwind()] } },
    logLevel: 'warn',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      fs: { allow: [repo, fs.realpathSync(path.join(repo, 'node_modules'))] },
    },
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });

  // Warm the dev server so module transforms do not count as page load time.
  const warm = await browser.newPage();
  const warmErrors = [];
  warm.on('pageerror', (error) => warmErrors.push(error.message));
  warm.on('console', (message) => {
    if (message.type() === 'error')
      console.warn('harness console error:', message.text().slice(0, 300));
  });
  await warm.goto(`http://127.0.0.1:${port}/`, { timeout: 180000 });
  await warm.waitForTimeout(SETTLE_MS);
  await warm.close();
  if (warmErrors.length)
    throw new Error(`harness page errors: ${warmErrors.join(' | ')}`);

  const results = [];
  for (const viewport of VIEWPORTS) {
    results.push(await measure(browser, viewport));
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await screenshots(browser, viewport);
    }
  }

  fs.writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(
    JSON.stringify(
      results.map(({ frames, ...summary }) => summary),
      null,
      2
    )
  );
  console.log(`evidence: ${outPath}`);

  if (!noAssert) {
    for (const result of results) {
      assert.deepEqual(result.pageErrors, [], `${result.viewport} page errors`);
      assert.ok(
        result.gridAtFirstPaint,
        `${result.viewport}: the grid must be present at first paint`
      );
      assert.ok(
        result.cls <= maxCls,
        `${result.viewport}: layout-shift total ${result.cls} exceeds ${maxCls}`
      );
      assert.ok(
        result.gridMaxMovePx <= maxMove,
        `${result.viewport}: grid box moved ${result.gridMaxMovePx}px (limit ${maxMove}px)`
      );
    }
    console.log('PASS calendar first paint holds its final layout');
  }
} catch (error) {
  console.error('FAIL', error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
