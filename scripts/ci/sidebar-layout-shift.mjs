#!/usr/bin/env node
/**
 * Headless layout-shift check for the shared satellite sidebar in hover mode.
 *
 * Mounts the real shared sidebar chrome (packages/ui custom/structure,
 * satellite-shell, satellite-content, use-satellite-shell) with static
 * fixtures through Vite, hovers the collapsed rail so it expands, and asserts
 * that the expand/collapse cycle never moves or resizes the calendar grid and
 * accumulates no meaningful Layout Instability score.
 *
 *   node scripts/ci/sidebar-layout-shift.mjs
 *
 * Environment: SIDEBAR_SHIFT_PORT (default 4191), SIDEBAR_SHIFT_OUT (JSON
 * evidence path), SIDEBAR_SHIFT_TOLERANCE (default 0.001),
 * SIDEBAR_SHIFT_SHOTS (directory for screenshots of the three states),
 * SIDEBAR_SHIFT_NO_ASSERT=1 to print numbers without failing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const here = import.meta.dirname;
const repo = path.resolve(here, '../..');
const harness = path.join(repo, 'packages/ui/tests/sidebar-layout-shift');
const port = Number(process.env.SIDEBAR_SHIFT_PORT ?? 4191);
const tolerance = Number(process.env.SIDEBAR_SHIFT_TOLERANCE ?? 0.001);
const outPath =
  process.env.SIDEBAR_SHIFT_OUT ??
  path.join(os.tmpdir(), `sidebar-layout-shift-${process.pid}.json`);
const noAssert = process.env.SIDEBAR_SHIFT_NO_ASSERT === '1';

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

const rectKey = (r) =>
  [r.x, r.y, r.width, r.height].map((n) => n.toFixed(3)).join(',');

/** Runs in the page: records layout-shift entries and per-frame rects. */
function installProbes() {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    const aside = document.querySelector('aside');
    for (const entry of list.getEntries()) {
      window.__shifts.push({
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
        sources: entry.sources.map((source) => {
          const node = source.node;
          const testId = node?.getAttribute?.('data-testid');
          return {
            node: node
              ? `${node.nodeName.toLowerCase()}${testId ? `[${testId}]` : ''}`
              : 'detached',
            inSidebar: Boolean(node && aside?.contains(node)),
            previous: source.previousRect.toJSON(),
            current: source.currentRect.toJSON(),
          };
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  window.__sample = (label, ms) =>
    new Promise((resolve) => {
      const frames = [];
      const start = performance.now();
      const box = (el) => {
        const r = el?.getBoundingClientRect();
        return r && { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const tick = () => {
        frames.push({
          t: Math.round(performance.now() - start),
          grid: box(document.querySelector('[data-testid="calendar-grid"]')),
          aside: box(document.querySelector('aside')),
        });
        if (performance.now() - start < ms) requestAnimationFrame(tick);
        else resolve({ label, frames });
      };
      requestAnimationFrame(tick);
    });
}

let server;
let browser;
try {
  server = await createServer({
    root: harness,
    configFile: false,
    cacheDir: path.join(
      os.tmpdir(),
      `sidebar-layout-shift-vite-${process.pid}`
    ),
    plugins: [react()],
    resolve: { alias: sourceAliases(), dedupe: ['react', 'react-dom'] },
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
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(20000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(installProbes);
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator('[data-testid="calendar-grid"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  const initial = await page.evaluate(() =>
    document
      .querySelector('[data-testid="calendar-grid"]')
      .getBoundingClientRect()
      .toJSON()
  );
  const initialAside = await page.evaluate(() =>
    document.querySelector('aside').getBoundingClientRect().toJSON()
  );
  await page.evaluate(() => {
    window.__shifts.length = 0;
  });

  const shots = process.env.SIDEBAR_SHIFT_SHOTS;
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, '1-collapsed.png') });
    await page.mouse.move(24, 400);
    await page.waitForTimeout(70);
    await page.screenshot({ path: path.join(shots, '2-expanding.png') });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, '3-expanded.png') });
    await page.mouse.move(900, 450);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__shifts.length = 0;
    });
  }

  const cycles = [];
  for (let i = 0; i < 2; i += 1) {
    await page.mouse.move(720, 450);
    await page.waitForTimeout(300);
    const expand = page.evaluate(() => window.__sample('expand', 900));
    await page.mouse.move(24, 400);
    cycles.push(await expand);
    const collapse = page.evaluate(() => window.__sample('collapse', 900));
    await page.mouse.move(900, 450);
    cycles.push(await collapse);
  }
  await page.waitForTimeout(300);
  const shifts = await page.evaluate(() => window.__shifts);

  const frames = cycles.flatMap((c) => c.frames);
  const expandedAsideWidth = Math.max(
    ...cycles
      .filter((c) => c.label === 'expand')
      .flatMap((c) => c.frames.map((f) => f.aside.width))
  );
  const gridRects = new Set([
    rectKey(initial),
    ...frames.map((f) => rectKey(f.grid)),
  ]);
  const total = shifts.reduce((sum, s) => sum + s.value, 0);
  const sidebarOnly = shifts.reduce(
    (sum, s) =>
      s.sources.length > 0 && s.sources.every((src) => src.inSidebar)
        ? sum + s.value
        : sum,
    0
  );
  const result = {
    viewport: '1440x900',
    initialGridRect: initial,
    initialAsideRect: initialAside,
    expandedAsideWidth,
    distinctGridRects: [...gridRects],
    sampledFrames: frames.length,
    layoutShiftEntries: shifts.length,
    layoutShiftTotal: Number(total.toFixed(6)),
    layoutShiftInsideSidebar: Number(sidebarOnly.toFixed(6)),
    layoutShiftOutsideSidebar: Number((total - sidebarOnly).toFixed(6)),
    outsideSidebarSources: shifts
      .flatMap((s) => s.sources.filter((x) => !x.inSidebar))
      .slice(0, 6),
    pageErrors,
  };
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ result, shifts, cycles }, null, 2)}\n`
  );
  console.log(JSON.stringify(result, null, 2));
  console.log(`evidence: ${outPath}`);

  if (!noAssert) {
    assert.deepEqual(pageErrors, [], 'page errors');
    assert.ok(
      expandedAsideWidth > initialAside.width + 100,
      `sidebar must visibly expand on hover (collapsed ${initialAside.width}px, expanded max ${expandedAsideWidth}px)`
    );
    assert.equal(
      gridRects.size,
      1,
      `grid rect changed during expand/collapse: ${[...gridRects].join(' | ')}`
    );
    assert.ok(
      result.layoutShiftTotal <= tolerance,
      `layout-shift total ${result.layoutShiftTotal} exceeds ${tolerance}`
    );
    console.log('PASS sidebar hover expand is a pure overlay');
  }
} catch (error) {
  console.error('FAIL', error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
