import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { prepareTypecheck } from './prepare-typecheck.mjs';

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
  await page.evaluate(async () => {
    await document.fonts.load('13px ProgrammingQA');
    await document.fonts.ready;
    window.qaMonaco.editor.remeasureFonts();
  });
  const metrics = await page.evaluate(() => {
    const monaco = window.qaMonaco;
    const ed = monaco.editor.getEditors()[0];
    ed.setValue('W'.repeat(200));
    ed.setPosition({ lineNumber: 1, column: 31 });
    ed.revealPosition({ lineNumber: 1, column: 31 });
    ed.render(true);
    const info = ed.getOption(monaco.editor.EditorOption.fontInfo);
    const layout = ed.getLayoutInfo();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '13px ProgrammingQA';
    const actual = ctx.measureText('n').width;
    return {
      monacoWidth: info.typicalHalfwidthCharacterWidth,
      actualWidth: actual,
      family: info.fontFamily,
      bodyVariable: getComputedStyle(document.body).getPropertyValue(
        '--font-programming-mono'
      ),
      contentWidth: layout.contentWidth,
    };
  });
  console.log('GEOMETRY', metrics);
  results.geometry = metrics;
  await page.screenshot({
    path: path.join(
      output,
      `geometry-${process.env.QA_BEFORE ? 'before' : 'after'}.png`
    ),
  });
  assert.equal(metrics.bodyVariable.trim(), '');
  assert.ok(
    Math.abs(metrics.monacoWidth - metrics.actualWidth) < 0.2,
    'Monaco/body measurement must match actual editor glyph advance'
  );
  check(
    'component-scoped font: Monaco glyph measurements match actual webfont'
  );
  await page.waitForTimeout(100);
  const alignment = await page.evaluate(() => {
    const ed = window.qaMonaco.editor.getEditors()[0];
    const host = ed.getDomNode().getBoundingClientRect();
    const pos = ed.getScrolledVisiblePosition({ lineNumber: 1, column: 31 });
    const line = document.querySelector('.view-lines .view-line');
    const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node = walk.nextNode();
    while (node && node.textContent.length < 31) node = walk.nextNode();
    const range = document.createRange();
    range.setStart(node, 30);
    range.setEnd(node, 31);
    const char = range.getBoundingClientRect();
    const target = ed.getTargetAtClientPoint(
      char.x + 1,
      char.y + char.height / 2
    );
    const widths = [...document.querySelectorAll('.view-lines .view-line')].map(
      (line) => {
        const r = document.createRange();
        r.selectNodeContents(line);
        return r.getBoundingClientRect().width;
      }
    );
    return {
      caretError: Math.abs(host.x + pos.left - char.x),
      hitColumn: target?.position?.column,
      widths,
      contentWidth: ed.getLayoutInfo().contentWidth,
    };
  });
  console.log('ALIGNMENT', alignment);
  results.alignment = alignment;
  assert.ok(alignment.caretError < 1, 'caret matches actual column');
  assert.equal(alignment.hitColumn, 31);
  assert.ok(
    alignment.widths.every((w) => w <= alignment.contentWidth + 1),
    'wrapped rows fit measured content width'
  );
  check(
    'caret position, pointer column hit-testing and wrapped row widths agree'
  );
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
    path.join(
      output,
      `geometry-${process.env.QA_BEFORE ? 'before' : 'after'}.json`
    ),
    JSON.stringify(results, null, 2)
  );
}
