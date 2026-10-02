import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createServer } = await import(require.resolve('vite'));
const react = (await import(require.resolve('@vitejs/plugin-react'))).default;
const tailwind = (await import(require.resolve('@tailwindcss/postcss')))
  .default;
const playwright = require('playwright');
const chromium = playwright.chromium ?? playwright.default?.chromium;
const here = import.meta.dirname;
const repo = path.resolve(here, '../../../..');
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
const output = path.join(here, 'evidence', 'canonical');
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
  results.url =
    'http://127.0.0.1:4187/11111111-1111-4111-8111-111111111111/programming';
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => results.consoleErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') results.consoleErrors.push(m.text());
  });
  const base = '/11111111-1111-4111-8111-111111111111/programming';
  const alpha = '44444444-4444-4444-8444-444444444444';
  const beta = '55555555-5555-4555-8555-555555555555';
  await page.goto(results.url);
  await page
    .getByRole('heading', { name: 'Programming', exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('link', { name: 'Edit problem' }).count(),
    0
  );
  assert.equal(
    await page.getByRole('link', { name: 'Manage problems' }).count(),
    0
  );
  await page.getByRole('link', { name: 'Next problems' }).click();
  assert.ok(new URL(page.url()).searchParams.get('cursor'));
  assert.equal(
    await page.getByRole('link', { name: 'Next problems' }).count(),
    0
  );
  await page.goBack();
  check('real catalog capabilities and cursor continuation with browser Back');
  await page.getByRole('link', { name: 'Open problem' }).first().click();
  await page.locator('.monaco-editor').waitFor();
  async function writeEditor(value) {
    await page
      .locator('.monaco-editor .view-lines')
      .click({ position: { x: 80, y: 12 } });
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(value);
    await page.locator('.view-lines').filter({ hasText: value }).waitFor();
  }
  async function expectSource(value) {
    await page.locator('.view-lines').filter({ hasText: value }).waitFor();
  }
  async function selectProblem(name) {
    await page.getByRole('combobox', { name: 'Programming problems' }).click();
    await page.getByRole('option', { name, exact: true }).click();
  }
  await writeEditor('# alpha persisted');
  await selectProblem('Beta');
  assert.ok(page.url().includes(beta));
  await writeEditor('# beta persisted');
  await page.goBack();
  await expectSource('# alpha persisted');
  await page.goForward();
  await expectSource('# beta persisted');
  await page.reload();
  await expectSource('# beta persisted');
  check(
    'actual canonical workspace problem switch, reload and Back/Forward restore scoped Monaco drafts'
  );
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'JavaScript', exact: true }).click();
  await writeEditor('// beta javascript');
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'Python', exact: true }).click();
  await expectSource('# beta persisted');
  await page.reload();
  await expectSource('# beta persisted');
  check('language-specific drafts survive switch and reload');
  await page.evaluate(() =>
    window.qaCanonical.navigate(`${location.pathname}?history=true`)
  );

  await page.reload();
  await expectSource('# beta persisted');
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await page.getByRole('button', { name: /Submission · Python/ }).click();
  await page.getByText('older public output', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('older public output', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('tab', { name: 'Result', exact: true })
      .getAttribute('aria-selected'),
    'true'
  );
  const requests = await page.evaluate(() => window.qaCanonical.state.getCalls);
  assert.ok(
    requests.some(
      (args) =>
        args[0] === '11111111-1111-4111-8111-111111111111' &&
        args[2] === '55555555-5555-4555-8555-555555555555' &&
        args[3] === '66666666-6666-4666-8666-666666666666'
    )
  );
  check(
    'inspected execution beyond first 25 history rows reloads via the scoped direct getter'
  );
  await page.evaluate(() => window.qaCanonical.setActor('different-actor'));
  await expectSource('# Beta starter');
  await page.evaluate(() => window.qaCanonical.setActor('synthetic-actor'));
  await expectSource('# beta persisted');
  check('actor switch cannot expose another actor draft');
  await page.evaluate(() => {
    window.qaCanonical.state.deferred = true;
  });
  await page.getByRole('button', { name: 'Run tests', exact: true }).click();
  await page.waitForFunction(
    () => typeof window.qaCanonical.state.resolve === 'function'
  );
  await selectProblem('Alpha');
  await expectSource('# alpha persisted');
  await page.evaluate(() => window.qaCanonical.state.resolve());
  await page.waitForTimeout(150);
  assert.equal(
    await page
      .getByRole('tab', { name: 'Test cases' })
      .getAttribute('aria-selected'),
    'true'
  );
  const scope = await page.evaluate(() =>
    JSON.parse(
      sessionStorage.getItem(
        'ttr-programming-v1:' +
          JSON.stringify([
            'synthetic-actor',
            '11111111-1111-4111-8111-111111111111',
            'synthetic-learner',
            '44444444-4444-4444-8444-444444444444',
          ])
      )
    )
  );
  assert.equal(scope.submissionId, null);
  check(
    'late submit response cannot alter another problem draft or result selection'
  );
  await page.evaluate(
    (url) => window.qaCanonical.navigate(url),
    `${base}?mode=author`
  );
  await page.getByRole('link', { name: 'Edit problem' }).first().click();
  await page
    .getByRole('heading', { name: 'Edit problem', exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Test case 1', exact: true }).click();
  await page.getByRole('button', { name: 'Test case 2', exact: true }).click();
  const remove = page.getByRole('button', {
    name: 'Remove test case',
    exact: true,
  });
  assert.equal(await remove.first().isDisabled(), true);
  assert.equal(await remove.nth(1).isDisabled(), false);
  const add = page.getByRole('button', { name: 'Add test case', exact: true });
  for (let i = 2; i < 9; i++) await add.click();
  assert.equal(await add.isDisabled(), true);
  await page.evaluate(() => {
    window.qaCanonical.state.saveStatus = 409;
  });
  await page.getByRole('button', { name: 'Save problem', exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'This problem changed' })
    .waitFor();
  assert.ok(page.url().endsWith('/edit'));
  check(
    'actual shared author form enforces nine cases and preserves edits on optimistic conflict'
  );
  await page.evaluate(() => {
    window.qaCanonical.state.saveStatus = 200;
  });
  await page.getByRole('button', { name: 'Save problem', exact: true }).click();
  await page.waitForFunction(() => location.search === '?mode=author');
  const payload = await page.evaluate(() => window.qaCanonical.state.saved);
  assert.equal(payload.cases.length, 9);
  assert.equal(payload.title.en, 'Alpha');
  check(
    'actual author edit form submits a strict-sized fixture and returns canonical preview route'
  );
  await page.evaluate(
    (url) => window.qaCanonical.navigate(url),
    `${base}/problems/new`
  );
  await page
    .getByRole('heading', { name: 'New problem', exact: true })
    .waitFor();
  await page.getByLabel('Problem slug', { exact: true }).fill('invalid slug');
  assert.equal(
    await page
      .getByLabel('Problem slug', { exact: true })
      .evaluate((el) => el.checkValidity()),
    false
  );
  await page.getByLabel('Problem slug', { exact: true }).fill('new-synthetic');
  await page.getByLabel('Title', { exact: true }).nth(0).fill('New synthetic');
  await page.getByLabel('Title', { exact: true }).nth(1).fill('Bài tổng hợp');
  await page
    .getByLabel('Problem statement', { exact: true })
    .nth(0)
    .fill('Print input');
  await page
    .getByLabel('Problem statement', { exact: true })
    .nth(1)
    .fill('In đầu vào');
  await page.getByRole('button', { name: 'Save problem', exact: true }).click();
  await page.waitForFunction(() =>
    location.pathname.endsWith('33333333-3333-4333-8333-333333333333')
  );
  check(
    'actual author create form saves and navigates to an opaque canonical UUID'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    (url) => window.qaCanonical.navigate(url),
    `${base}/problems/${alpha}?parent=true`
  );
  await page
    .getByRole('status')
    .filter({ hasText: 'Parents can review' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Run tests', exact: true })
      .isDisabled(),
    true
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  );
  check('canonical parent workspace remains read only without phone overflow');
  await page.screenshot({
    path: path.join(output, 'canonical-phone-parent.png'),
  });
  const blocked = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  blocked.on('pageerror', (error) => results.consoleErrors.push(error.message));
  blocked.on('console', (message) => {
    if (message.type() === 'error') results.consoleErrors.push(message.text());
  });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new Error('Synthetic storage unavailable');
      },
    });
  });
  await blocked.goto(`http://127.0.0.1:4187${base}/problems/${alpha}`);
  await blocked.locator('.monaco-editor').waitFor();
  await blocked
    .locator('.monaco-editor .view-lines')
    .click({ position: { x: 80, y: 12 } });
  await blocked.keyboard.press('ControlOrMeta+A');
  await blocked.keyboard.type('# fallback memory');
  await blocked.getByRole('combobox', { name: 'Programming problems' }).click();
  await blocked.getByRole('option', { name: 'Beta', exact: true }).click();
  await blocked.goBack();
  await blocked
    .locator('.view-lines')
    .filter({ hasText: '# fallback memory' })
    .waitFor();
  await blocked.close();
  check('storage failure retains mounted navigation drafts in memory');
  assert.deepEqual(results.consoleErrors, []);
  results.boundaries =
    'Actual catalog, author form, ProgrammingWorkspace, CodingLab, shared UI, Monaco and licensed font; synthetic authorized DTOs, Next navigation/font/dynamic and server actions. No actual Next RSC/router/auth/API/DB/judge.';
}
try {
  await Promise.race([run(), budget]);
} catch (error) {
  results.failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
  results.finishedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify(results, null, 2)
  );
}
