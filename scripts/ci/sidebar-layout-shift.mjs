#!/usr/bin/env node
/**
 * Headless layout-shift check for the shared satellite sidebar in hover mode,
 * or in minimal mode with SIDEBAR_SHIFT_BEHAVIOR=minimal, which also checks
 * that keyboard focus opens the panel and Escape closes it.
 *
 * Mounts the real shared sidebar chrome (packages/ui custom/structure,
 * satellite-shell, satellite-content, use-satellite-shell) with static
 * fixtures through Vite, hovers the collapsed rail so it expands, and asserts
 * that the expand/collapse cycle never moves or resizes the calendar grid and
 * accumulates no meaningful Layout Instability score. It also checks that the
 * logo and every navigation icon keep the same position when the panel opens,
 * that the reveal animates opacity only (labels fade, nothing slides), and in
 * minimal mode that the page keeps clear of the floating logo button at
 * several desktop widths.
 *
 *   node scripts/ci/sidebar-layout-shift.mjs
 *
 * Environment: SIDEBAR_SHIFT_PORT (default 4191), SIDEBAR_SHIFT_OUT (JSON
 * evidence path), SIDEBAR_SHIFT_TOLERANCE (default 0.001),
 * SIDEBAR_SHIFT_SHOTS (directory for screenshots of the three states),
 * SIDEBAR_SHIFT_VIDEO (directory for a recording of the run),
 * SIDEBAR_SHIFT_NO_ASSERT=1 to print numbers without failing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { sidebarEvidencePath } from './sidebar-evidence-path.mjs';
import {
  BOTTOM_CLUSTER,
  ICON_TOLERANCE,
  maxShift,
  measureIconMatrix,
  moved,
  TOP_ANCHORED,
} from './sidebar-layout-geometry.mjs';
import { installProbes } from './sidebar-layout-probes.mjs';

const require = createRequire(import.meta.url);
const here = import.meta.dirname;
const repo = path.resolve(here, '../..');
const harness = path.join(repo, 'packages/ui/tests/sidebar-layout-shift');
const port = Number(process.env.SIDEBAR_SHIFT_PORT ?? 4191);
const tolerance = Number(process.env.SIDEBAR_SHIFT_TOLERANCE ?? 0.001);
const noAssert = process.env.SIDEBAR_SHIFT_NO_ASSERT === '1';
const behavior =
  process.env.SIDEBAR_SHIFT_BEHAVIOR === 'minimal' ? 'minimal' : 'hover';

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

let server;
let browser;
const pageErrors = [];
try {
  server = await createServer({
    root: harness,
    configFile: false,
    cacheDir: path.join(
      os.tmpdir(),
      `sidebar-layout-shift-vite-${process.pid}`
    ),
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: /^next\/image$/u,
          replacement: path.join(
            repo,
            'packages/start-bridge/src/next/image.tsx'
          ),
        },
        ...sourceAliases(),
      ],
      dedupe: ['react', 'react-dom'],
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
  const video = process.env.SIDEBAR_SHIFT_VIDEO;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(video
      ? { recordVideo: { dir: video, size: { width: 1440, height: 900 } } }
      : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(installProbes);
  await page.goto(`http://127.0.0.1:${port}/?behavior=${behavior}`);
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

  // The logo and every icon keep their place when the panel opens, and the
  // reveal only fades.
  const overlayState = () =>
    page.evaluate(() => document.querySelector('aside').dataset.overlayState);
  const openPoint = async () => {
    if (behavior !== 'minimal') return { x: 24, y: 400 };
    const bounds = await page
      .locator('[data-sidebar-reveal-trigger]')
      .boundingBox();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  };
  await page.mouse.move(900, 450);
  await page.waitForTimeout(600);
  const restingGeometry = await page.evaluate(() => window.__geometry());
  const point = await openPoint();
  await page.mouse.move(point.x, point.y);
  await page.locator('aside[data-overlay-state="open"]').waitFor();
  await page.waitForTimeout(40);
  const revealAnimations = await page.evaluate(() =>
    window.__animatedProperties()
  );
  await page.waitForTimeout(600);
  const openGeometry = await page.evaluate(() => window.__geometry());
  await page.mouse.move(900, 450);
  await page.waitForFunction(
    () => !document.querySelector('aside').dataset.overlayState
  );
  await page.waitForTimeout(300);
  const iconKeys = Object.keys(restingGeometry.icons);
  const geometry = {
    resting: restingGeometry,
    open: openGeometry,
    stillOverlayAfterLeave: (await overlayState()) ?? null,
    logoMoved: moved(restingGeometry.logo, openGeometry.logo),
    triggerMoved:
      behavior === 'minimal'
        ? moved(restingGeometry.trigger, openGeometry.trigger)
        : false,
    movedIcons: iconKeys.filter((key) =>
      moved(restingGeometry.icons[key], openGeometry.icons[key])
    ),
    movedExtras: Object.keys(restingGeometry.extras).filter((key) =>
      moved(
        restingGeometry.extras[key],
        openGeometry.extras[key],
        !TOP_ANCHORED.has(key)
      )
    ),
    iconShiftPx: {
      icons: Object.fromEntries(
        iconKeys.map((key) => [
          key,
          {
            dx: openGeometry.icons[key]
              ? openGeometry.icons[key].x - restingGeometry.icons[key].x
              : null,
            dy: openGeometry.icons[key]
              ? openGeometry.icons[key].y - restingGeometry.icons[key].y
              : null,
          },
        ])
      ),
      extras: Object.fromEntries(
        Object.keys(restingGeometry.extras).map((key) => [
          key,
          {
            dx: openGeometry.extras[key]
              ? openGeometry.extras[key].x - restingGeometry.extras[key].x
              : null,
            dy: openGeometry.extras[key]
              ? openGeometry.extras[key].y - restingGeometry.extras[key].y
              : null,
          },
        ])
      ),
      logo:
        openGeometry.logo && restingGeometry.logo
          ? {
              dx: openGeometry.logo.x - restingGeometry.logo.x,
              dy: openGeometry.logo.y - restingGeometry.logo.y,
            }
          : null,
      max: maxShift(
        {
          ...restingGeometry.icons,
          ...restingGeometry.extras,
          logo: restingGeometry.logo ?? { x: 0, y: 0 },
        },
        {
          ...openGeometry.icons,
          ...openGeometry.extras,
          logo: openGeometry.logo ?? { x: 0, y: 0 },
        },
        BOTTOM_CLUSTER
      ),
    },
    revealAnimations,
    nonFadeAnimations: revealAnimations.filter((animation) =>
      animation.properties.some(
        (property) =>
          !['opacity', 'color', 'backgroundColor', 'borderColor'].includes(
            property
          )
      )
    ),
  };

  // Minimal mode: the page keeps clear of the floating logo at every desktop
  // width, and the logo has room around it.
  let clearance = null;
  if (behavior === 'minimal') {
    clearance = [];
    for (const width of [768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const g = await page.evaluate(() => window.__geometry());
      clearance.push({
        width,
        trigger: g.trigger,
        triggerRadius: g.triggerRadius,
        logo: g.logo,
        gridLeft: g.grid.x,
        gap: g.grid.x - (g.trigger.x + g.trigger.width),
        padding: (g.trigger.width - g.logo.width) / 2,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
  }

  // Minimal mode: the logo is the first stop, and focusing it by keyboard
  // opens the panel without moving focus; Escape closes it again.
  let keyboard = null;
  if (behavior === 'minimal') {
    const state = () =>
      page.evaluate(() => ({
        overlay: document.querySelector('aside').dataset.overlayState ?? null,
        onTrigger:
          document.activeElement?.hasAttribute('data-sidebar-reveal-trigger') ??
          false,
      }));
    await page.waitForTimeout(600);
    const resting = await state();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(400);
    const focused = await state();
    if (shots) {
      await page.screenshot({ path: path.join(shots, '4-keyboard.png') });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    keyboard = { resting, focused, escaped: await state() };

    const logo = page.locator('[data-sidebar-reveal-trigger]');
    const bounds = await logo.boundingBox();
    assert.ok(bounds, 'the resting logo has a visible pointer target');
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    const location = page.url();
    await page.mouse.move(x, y);
    await page.locator('aside[data-overlay-state="open"]').waitFor();
    await page.mouse.click(x, y);
    await page.mouse.move(900, 450);
    await page.waitForTimeout(520);
    assert.equal(
      page.url(),
      location,
      'clicking the reveal logo stays on the page'
    );
    assert.equal(
      (await state()).overlay,
      'open',
      'click pins the hovered panel'
    );
  }

  if (behavior === 'hover') {
    const aside = page.locator('aside');
    const picker = page.getByRole('dialog', { name: 'Select workspace' });
    const switcher = aside.getByRole('button', { name: 'Switch workspace' });
    assert.equal(
      await page.getByRole('button', { name: /workspace selector/i }).count(),
      0,
      'there is no show/hide control for the workspace picker'
    );
    assert.equal(
      await switcher.locator('svg.lucide-chevron-down').count(),
      0,
      'the workspace trigger has no dropdown chevron'
    );
    await page.mouse.move(24, 400);
    await switcher.click();
    await picker.waitFor();
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'hidden' });
    await page.mouse.move(900, 450);
    await switcher.locator('[data-invitation-dot]').waitFor();
    await switcher.locator('[data-slot="avatar-image"]').waitFor();
    assert.equal(
      await switcher
        .locator('span')
        .filter({ hasText: /^Switch workspace$/ })
        .count(),
      0
    );
    if (shots) {
      await page.screenshot({
        path: path.join(shots, '4-collapsed-avatar.png'),
      });
    }
    await page.mouse.move(24, 400);
    await switcher.getByText('Switch workspace', { exact: true }).waitFor();
    assert.equal(
      await picker.isVisible(),
      false,
      'hover must not reopen the picker'
    );
    if (shots) {
      await page.screenshot({
        path: path.join(shots, '5-expanded-avatar.png'),
      });
    }
  }

  const matrix = behavior === 'hover' ? await measureIconMatrix(page) : null;

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
    behavior,
    keyboard,
    geometry: {
      logoMoved: geometry.logoMoved,
      triggerMoved: geometry.triggerMoved,
      checkedIcons: iconKeys.length,
      openIcons: Object.keys(openGeometry.icons).length,
      movedIcons: geometry.movedIcons,
      movedExtras: geometry.movedExtras,
      iconShiftPx: geometry.iconShiftPx,
      matrix,
      truncatedLabels: openGeometry.truncatedLabels,
      nonFadeAnimations: geometry.nonFadeAnimations,
    },
    clearance,
  };
  const outPath = sidebarEvidencePath(process.env.SIDEBAR_SHIFT_OUT);
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ result, geometry, shifts, cycles }, null, 2)}\n`
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
    if (keyboard) {
      assert.deepEqual(
        keyboard,
        {
          resting: { overlay: null, onTrigger: false },
          focused: { overlay: 'open', onTrigger: true },
          escaped: { overlay: null, onTrigger: true },
        },
        'keyboard focus must open the minimal sidebar and Escape must close it'
      );
    }
    assert.equal(geometry.logoMoved, false, 'the logo must not move on open');
    assert.equal(
      geometry.triggerMoved,
      false,
      'the minimal logo button must not move on open'
    );
    // Minimal mode has no rail: its icons exist only in the open panel.
    assert.ok(
      (behavior === 'minimal'
        ? Object.keys(openGeometry.icons).length
        : iconKeys.length) >= 5,
      'every navigation icon is measured'
    );
    assert.deepEqual(
      geometry.movedIcons,
      [],
      'navigation icons must keep their position on open'
    );
    for (const row of matrix ?? []) {
      assert.ok(
        row.measured >= 8 && row.maxShiftPx <= ICON_TOLERANCE,
        `icons must not shift on open (${row.theme}, ${row.width}px): max ${row.maxShiftPx}px over ${row.measured} measured`
      );
    }
    assert.deepEqual(
      geometry.movedExtras,
      [],
      'avatars and footer icons must keep their position on open'
    );
    if (behavior === 'hover') {
      for (const key of ['workspaceAvatar', 'accountAvatar']) {
        assert.ok(
          restingGeometry.extras[key] && openGeometry.extras[key],
          `${key} is measured in the rail and the open panel`
        );
      }
    }
    assert.deepEqual(
      openGeometry.truncatedLabels,
      [],
      'labels in the open panel must fit'
    );
    assert.ok(geometry.revealAnimations.length > 0, 'the open panel fades in');
    assert.deepEqual(
      geometry.nonFadeAnimations,
      [],
      'the reveal may only fade (no slide, wipe or scale)'
    );
    for (const row of clearance ?? []) {
      assert.ok(
        row.gap >= 7.5,
        `page content must keep clear of the logo button at ${row.width}px (gap ${row.gap}px)`
      );
      assert.ok(
        row.padding >= 9.5,
        `the logo button needs room around the logo at ${row.width}px (padding ${row.padding}px)`
      );
      assert.ok(
        row.triggerRadius < row.trigger.height / 2 - 4,
        `the logo button is a rounded square, not a pill (radius ${row.triggerRadius}px)`
      );
      assert.deepEqual(
        [row.trigger.x, row.trigger.y],
        [clearance[0].trigger.x, clearance[0].trigger.y],
        'the logo button keeps one position at every width'
      );
    }
    console.log(`PASS sidebar ${behavior} expand is a pure overlay`);
  }
} catch (error) {
  console.error('FAIL', error.message);
  for (const pageError of pageErrors)
    console.error('Browser error:', pageError);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (process.env.SIDEBAR_SHIFT_VIDEO) {
    console.log(`video: ${process.env.SIDEBAR_SHIFT_VIDEO}`);
  }
  await server?.close();
}
