import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { prepareTypecheck } from './prepare-typecheck.mjs';
import {
  hasFreshSyntheticOutput,
  syntheticSubmissionOutput,
} from './synthetic-result.ts';

const require = createRequire(import.meta.url);
const { createServer } = await import(require.resolve('vite'));
const react = (await import(require.resolve('@vitejs/plugin-react'))).default;
const tailwind = (await import(require.resolve('@tailwindcss/postcss')))
  .default;
const playwright = require('playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
const here = import.meta.dirname;
const repo = path.resolve(here, '../../../..');
prepareTypecheck();
const coding = path.join(
  repo,
  'apps/learn/src/app/[locale]/(dashboard)/[wsId]/coding'
);
const results = {
  startedAt: new Date().toISOString(),
  url: '',
  checks: [],
  consoleErrors: [],
  screenshots: [],
};
const output = path.join(here, 'evidence');
fs.mkdirSync(output, { recursive: true });
const aliases = [
  { find: '@', replacement: path.join(repo, 'apps/learn/src') },
  { find: 'next/dynamic', replacement: path.join(here, 'dynamic.tsx') },
];
for (const namespace of ['ui', 'utils', 'icons', 'types']) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repo, 'packages', namespace, 'package.json'))
  );
  for (const [key, value] of Object.entries(pkg.exports)) {
    const declaredTarget =
      typeof value === 'string' ? value : (value.import ?? value.default);
    const target =
      namespace === 'types' && declaredTarget
        ? declaredTarget
            .replace(/^\.\/dist\//, './src/')
            .replace(/\.js$/, '.ts')
        : declaredTarget;
    if (!target) continue;
    const find = `@tuturuuu/${namespace}${key === '.' ? '' : key.slice(1)}`;
    if (find.includes('*'))
      aliases.push({
        find: new RegExp(`^${find.replace('*', '(.+)')}$`),
        replacement: path
          .join(repo, 'packages', namespace, target)
          .replace('*', '$1'),
      });
    else
      aliases.push({
        find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        replacement: path.join(repo, 'packages', namespace, target),
      });
  }
}
// Exact anchored exports before wildcard exports, independent of manifest order.
aliases.sort((a, b) => {
  const pattern = (entry) =>
    typeof entry.find === 'string' ? entry.find : entry.find.source;
  return (
    Number(pattern(a).includes('(.+)')) - Number(pattern(b).includes('(.+)')) ||
    pattern(b).length - pattern(a).length
  );
});
let server, browser, page;
const check = (name) => {
  results.checks.push({ name, status: 'pass' });
  console.log('PASS', name);
};
const budget = new Promise((_, reject) =>
  setTimeout(
    () => reject(new Error('10-minute batch budget expired')),
    600000
  ).unref()
);
async function run() {
  server = await createServer({
    root: here,
    configFile: false,
    cacheDir: path.join(here, '.vite'),
    plugins: [
      {
        name: 'synthetic-boundaries',
        enforce: 'pre',
        resolveId(id, importer) {
          if (
            (id === './actions' && importer?.startsWith(coding)) ||
            id === path.join(coding, 'actions.ts')
          )
            return path.join(here, 'judge.ts');
          if (
            id === '@/i18n/navigation' ||
            id === path.join(repo, 'apps/learn/src/i18n/navigation') ||
            id === path.join(repo, 'apps/learn/src/i18n/navigation.ts')
          )
            return path.join(here, 'canonical-navigation.tsx');
          if (id === './actions' && importer?.includes('/programming/'))
            return path.join(here, 'canonical-actions.ts');
          if (
            (id === './coding-font' || id === '../coding/coding-font') &&
            (importer?.startsWith(coding) ||
              importer?.includes('/programming/'))
          )
            return '\0qa-font';
        },
        load(id) {
          if (id === '\0qa-font')
            return 'export const programmingFont={variable:"qa-programming-font",style:{fontFamily:"ProgrammingQA"}};';
        },
      },
      react(),
    ],
    resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
    css: { postcss: { plugins: [tailwind()] } },
    server: {
      host: '127.0.0.1',
      port: 4187,
      strictPort: true,
      fs: {
        allow: [here, repo, fs.realpathSync(path.join(repo, 'node_modules'))],
      },
    },
  });
  await server.listen();
  results.url = 'http://127.0.0.1:4187/synthetic-programming';
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => results.consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') results.consoleErrors.push(m.text());
  });
  await page.goto(results.url);
  assert.equal(await page.title(), 'Synthetic Programming QA');
  await page.getByRole('combobox', { name: 'Programming problems' }).waitFor();
  await page.locator('.monaco-editor').waitFor();
  check('identity, meaningful lab and real Monaco render');
  const capture = async (name) => {
    const p = path.join(output, `${name}.png`);
    await page.screenshot({ path: p, fullPage: false });
    results.screenshots.push(p);
  };
  async function themeCapture(theme, width, height) {
    await page.setViewportSize({ width, height });
    await page.evaluate((t) => window.qa.setTheme(t), theme);
    await page.waitForFunction(
      (t) => document.documentElement.classList.contains(t),
      theme
    );
    await page.waitForTimeout(200);
    await capture(`${width < 500 ? 'phone' : 'desktop'}-${theme}`);
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
    const ratio = await page.getByRole('status').evaluate((el) => {
      const c = getComputedStyle(el);
      const cvs = document.createElement('canvas');
      cvs.width = cvs.height = 1;
      const ctx = cvs.getContext('2d');
      const lum = (color) => {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data]
          .slice(0, 3)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      };
      const a = lum(c.color),
        b = lum(c.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    assert.ok(ratio >= 4.5, `warning contrast ${ratio}`);
    check(
      `${theme} ${width}x${height}: no horizontal overflow or overlay; warning contrast ${ratio.toFixed(2)}:1`
    );
  }
  await themeCapture('dark', 1440, 1000);
  await themeCapture('light', 1440, 1000);
  await themeCapture('dark', 390, 844);
  await themeCapture('light', 390, 844);
  // The real shared shell is measured; inset values below are synthetic, not
  // claims about hardware notch behavior in desktop Chromium.
  await page.evaluate(() => {
    window.qa.setNavigation(true);
    document.documentElement.style.setProperty('--qa-safe-top', '24px');
    document.documentElement.style.setProperty('--qa-safe-bottom', '20px');
  });
  async function verifyMobileShell(name, width) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => {
      const main = document.querySelector('main');
      const nav = document.querySelector('nav');
      return (
        Math.abs(
          parseFloat(
            getComputedStyle(main).getPropertyValue('--mobile-nav-height')
          ) - nav.getBoundingClientRect().height
        ) < 1
      );
    });
    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('nav').getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      const toolbar = document
        .querySelector('main header')
        .getBoundingClientRect();
      const consolePanel = document
        .querySelector('#programming-console')
        .getBoundingClientRect();
      return {
        navHeight: nav.height,
        navBottom: nav.bottom,
        mainHeight: main.height,
        toolbarTop: toolbar.top,
        consoleBottom: consolePanel.bottom,
        viewport: innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    assert.equal(geometry.mainHeight, 844);
    assert.ok(
      geometry.toolbarTop >= geometry.navBottom - 1,
      JSON.stringify(geometry)
    );
    assert.ok(
      geometry.consoleBottom <= geometry.viewport - 19,
      JSON.stringify(geometry)
    );
    assert.ok(
      geometry.scrollHeight <= geometry.viewport + 1,
      JSON.stringify(geometry)
    );
    assert.ok(geometry.scrollWidth <= width, JSON.stringify(geometry));
    if (width < 768) assert.ok(geometry.navHeight > 24);
    else assert.equal(geometry.navHeight, 0);
    results.checks.push({
      name,
      status: 'pass',
      geometry,
      simulatedInsets: { top: 24, bottom: 20 },
    });
    console.log('PASS', name);
    await capture(name);
    return geometry;
  }
  const normalHeader = await verifyMobileShell(
    'phone-visible-navigation-simulated-insets',
    390
  );
  await page.evaluate(() => window.qa.setWrappedHeader(true));
  const wrappedHeader = await verifyMobileShell(
    'phone-wrapped-navigation-simulated-insets',
    390
  );
  assert.ok(wrappedHeader.navHeight > normalHeader.navHeight);
  await verifyMobileShell('navigation-breakpoint-767', 767);
  await verifyMobileShell('navigation-breakpoint-768', 768);
  await verifyMobileShell('navigation-return-phone', 390);
  await page.evaluate(() => {
    window.qa.setNavigation(false);
    window.qa.setWrappedHeader(false);
    document.documentElement.style.removeProperty('--qa-safe-top');
    document.documentElement.style.removeProperty('--qa-safe-bottom');
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.qa.setTheme('dark'));
  const firstCase = page
    .getByRole('button', { name: 'Public case 1', exact: true })
    .first();
  await firstCase.focus();
  await page.keyboard.press('Enter');
  assert.equal(await firstCase.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Space');
  assert.equal(await firstCase.getAttribute('aria-expanded'), 'false');
  check('real Accordion Enter/Space expand and collapse');
  const run = page.getByRole('button', { name: 'Run tests', exact: true });
  assert.equal(await run.isDisabled(), true);
  assert.equal(
    await page
      .getByRole('button', { name: 'Submit solution', exact: true })
      .isDisabled(),
    true
  );
  await page.getByRole('combobox', { name: 'Language' }).focus();
  await page.keyboard.press('Tab');
  assert.equal(
    await run.locator('..').evaluate((el) => el === document.activeElement),
    true
  );
  await page.getByRole('tooltip').filter({ hasText: 'Run tests' }).waitFor();
  await page.keyboard.press('Tab');
  const submitButton = page.getByRole('button', {
    name: 'Submit solution',
    exact: true,
  });
  assert.equal(
    await submitButton
      .locator('..')
      .evaluate((el) => el === document.activeElement),
    true
  );
  await page
    .getByRole('tooltip')
    .filter({ hasText: 'Submit solution' })
    .waitFor();
  check('disabled Run and Submit expose actual Radix tooltips by keyboard Tab');
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Language' }).focus();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => !document.querySelector('[role=tooltip]'));
  await run.locator('..').hover();
  await page.getByRole('tooltip').filter({ hasText: 'Run tests' }).waitFor();
  await page
    .locator('.monaco-editor .view-lines')
    .click({ position: { x: 100, y: 12 } });
  await page.keyboard.press('ControlOrMeta+Enter');
  assert.equal(
    await page.evaluate(() => window.__syntheticSubmitCount ?? 0),
    0
  );
  check(
    'offline Run/Submit and keyboard execution disabled with icon labels and tooltip'
  );
  const collapse = page.getByRole('button', { name: 'Collapse test console' });
  await collapse.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Expand test console' }).waitFor();
  assert.equal(
    await page.locator('#programming-console').getAttribute('inert'),
    ''
  );
  await capture('desktop-console-collapsed');
  await page.getByRole('button', { name: 'Expand test console' }).click();
  await page.getByRole('button', { name: 'Collapse test console' }).waitFor();
  assert.equal(
    await page.locator('#programming-console').getAttribute('inert'),
    null
  );
  check('console collapse/expand via keyboard; inert state follows real panel');
  const separator = page.getByRole('separator', {
    name: 'Resize test console',
  });
  const before = (await page.locator('#programming-console').boundingBox())
    .height;
  await separator.focus();
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  const after = (await page.locator('#programming-console').boundingBox())
    .height;
  assert.notEqual(before, after);
  check('real resizable separator ArrowUp changes console size');
  await page.getByRole('tab', { name: 'Test cases' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () =>
      document.querySelector('[role=tab][data-state=active]')?.textContent ===
      'Result'
  );
  assert.equal(
    await page
      .getByRole('tab', { name: 'Result' })
      .getAttribute('aria-selected'),
    'true'
  );
  check('real Tabs ArrowRight updates selected panel');
  await page
    .locator('.monaco-editor .view-lines')
    .click({ position: { x: 100, y: 12 } });
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('# synthetic alpha');
  await capture('desktop-edited-draft-initial');
  await page
    .locator('.view-lines')
    .filter({ hasText: 'synthetic alpha' })
    .waitFor();
  await page.waitForTimeout(100);
  await capture('desktop-edited-draft');
  await page.getByRole('combobox', { name: 'Programming problems' }).click();
  await page
    .getByRole('option', { name: 'Binary Search', exact: true })
    .click();
  await page
    .locator('.view-lines')
    .filter({ hasText: 'Binary search' })
    .waitFor();
  await page.getByRole('combobox', { name: 'Programming problems' }).click();
  await page.getByRole('option', { name: 'Two Sum', exact: true }).click();
  await page
    .locator('.view-lines')
    .filter({ hasText: 'synthetic alpha' })
    .waitFor();
  check('problem switch restores actual Monaco draft');
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page
    .getByRole('option', { name: 'JavaScript · unavailable', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page
    .getByRole('option', { name: 'Python · unavailable', exact: true })
    .click();
  await page
    .locator('.view-lines')
    .filter({ hasText: 'synthetic alpha' })
    .waitFor();
  check('language switch restores actual Monaco draft');
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator('.view-lines')
    .filter({ hasText: 'synthetic alpha' })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator('.view-lines')
    .filter({ hasText: 'synthetic alpha' })
    .waitFor();
  check('responsive layout remount preserves editor draft');
  await page.getByRole('button', { name: 'Collapse test console' }).click();
  await page.evaluate(() => window.qa.setReady(true));
  await run.click();
  await page.getByText('1 of 1 cases passed', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Collapse test console' })
      .getAttribute('aria-expanded'),
    'true'
  );
  await capture('desktop-synthetic-result');
  check(
    'synthetic judge result expands console and renders verdict without real execution'
  );
  await page
    .locator('.monaco-editor .view-lines')
    .click({ position: { x: 100, y: 12 } });
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.waitForFunction(() => window.__syntheticSubmitCount === 2);
  check('Ctrl/Cmd+Enter uses guarded test execution');
  for (const [challengeName, challengeSlug] of [
    ['Two Sum', 'two-sum'],
    ['Binary Search', 'binary-search'],
  ]) {
    await page.getByRole('combobox', { name: 'Programming problems' }).click();
    await page
      .getByRole('option', { name: challengeName, exact: true })
      .click();
    for (const actionName of ['Run tests', 'Submit solution']) {
      const beforeCount = await page.evaluate(
        () => window.__syntheticSubmitCount
      );
      const expectedOutput = syntheticSubmissionOutput({
        ordinal: beforeCount + 1,
        challengeSlug,
        kind: actionName === 'Run tests' ? 'test' : 'submit',
        output: challengeSlug === 'binary-search' ? '3\n' : '0 1\n',
      });
      await page.getByRole('button', { name: actionName, exact: true }).click();
      await page.waitForFunction(
        (count) => window.__syntheticSubmitCount === count + 1,
        beforeCount
      );
      await page.waitForFunction(hasFreshSyntheticOutput, expectedOutput);
      await page.getByText('1 of 1 cases passed', { exact: true }).waitFor();
      const panel = page.getByRole('tabpanel');
      assert.equal(
        await panel
          .locator('pre')
          .evaluateAll(
            (elements, expected) =>
              elements.filter((element) => element.textContent === expected)
                .length,
            expectedOutput
          ),
        1
      );
      assert.equal(
        await panel.getByText('Public case 1', { exact: true }).count(),
        1
      );
      assert.equal(
        await panel.getByText('Public case 2', { exact: true }).count(),
        0
      );
      assert.equal(
        await panel.getByText('Your output', { exact: true }).count(),
        1
      );
      check(
        `${challengeName} ${actionName}: fresh attempt output, verdict and rendered case count agree at 1/1`
      );
    }
  }

  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() => document.fonts.check('13px ProgrammingQA')),
    true
  );
  check('official local JetBrains Mono font loads');
  assert.deepEqual(results.consoleErrors, []);
  check('console/page errors absent');
}
try {
  await Promise.race([run(), budget]);
} catch (e) {
  results.error = e.stack;
  console.error(e);
  if (page)
    await page
      .screenshot({ path: path.join(output, 'failure.png') })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  const files = fs
    .readdirSync(coding)
    .filter((n) => /^(coding-.*\.tsx|coding-font\.ts)$/.test(n))
    .map((n) => path.join(coding, n));
  const lint = spawnSync(
    require.resolve('@biomejs/biome/bin/biome'),
    [
      'check',
      ...files,
      path.join(repo, 'packages/ui/src/components/ui/custom/structure.tsx'),
      path.join(repo, 'packages/ui/src/components/ui/resizable.tsx'),
      path.join(
        repo,
        'packages/satellite/src/components/sidebar-structure.tsx'
      ),
      path.join(
        repo,
        'apps/learn/src/app/[locale]/(dashboard)/[wsId]/structure.tsx'
      ),
    ],
    { cwd: repo, encoding: 'utf8', timeout: 30000 }
  );
  results.lint = { status: lint.status, output: lint.stdout + lint.stderr };
  console.log('LINT', lint.status, results.lint.output);
  const types = process.env.QA_SKIP_TYPES
    ? {
        status: 0,
        stdout:
          'Source-aliased focused type check already passed; unchanged source, not repeated.',
        stderr: '',
      }
    : spawnSync(
        process.execPath,
        [
          path.join(
            path.dirname(require.resolve('typescript/package.json')),
            'bin/tsc'
          ),
          '-p',
          path.join(here, 'tsconfig.json'),
        ],
        { cwd: here, encoding: 'utf8', timeout: 90000 }
      );
  results.typecheck = {
    status: types.status,
    output: types.stdout + types.stderr,
    error: types.error?.message,
  };
  console.log(
    'TYPECHECK',
    types.status,
    results.typecheck.output.slice(0, 3000)
  );
  if (results.lint.status !== 0 || results.typecheck.status !== 0)
    process.exitCode = 1;
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(results, null, 2)
  );
}
