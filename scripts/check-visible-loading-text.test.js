const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  collectCounts,
  compareToBaseline,
  findVisibleLoadingText,
  isScannedPath,
  total,
} = require('./check-visible-loading-text.js');

test('flags visible loading copy in JSX', () => {
  const source = [
    '<p>Loading...</p>',
    '<span>{t("loading")}</span>',
    "{isFetching ? t('common.loading') : t('load_more')}",
    "<div>{tc('loading_users')}</div>",
    "label={walletsLoading ? 'Loading...' : undefined}",
    "placeholder={busy ? 'Loading labels...' : 'Pick'}",
    "{query.isPending && <p>{t('projectsLoading')}</p>}",
    '<p>Đang tải…</p>',
  ].join('\n');
  assert.deepEqual(findVisibleLoadingText(source), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('allows screen-reader-only text and non-loading keys', () => {
  const source = [
    '<span className="sr-only">{t("loading")}</span>',
    '<div role="status" aria-label={t("common.loading")} />',
    '<LoadingRegion srLabel={t("common.loading")}>',
    '<svg><title>Loading</title></svg>',
    "{t('loading_error')}",
    "{t('load_more')}",
    "setStatus('loading');",
    "useState<'loading' | 'ready'>('loading');",
    '// loading-text-allowed: slow network notice is real content',
    "{t('join_loading_slow_title')}",
    '<p role="status" className="sr-only">',
    "  {t('pricesLoading')}",
    '</p>',
    'aria-label={',
    "  isFetching ? t('common.loading') : undefined",
    '}',
  ].join('\n');
  assert.deepEqual(findVisibleLoadingText(source), []);
});

test('wrapped visible text after an ordinary tag is still flagged', () => {
  const source = [
    '<p className="text-muted-foreground text-sm">',
    "  {t('common.loading')}",
    '</p>',
    '<Button aria-label={label}>',
    "  {t('loading')}",
    '</Button>',
  ].join('\n');
  assert.deepEqual(findVisibleLoadingText(source), [2, 5]);
});

test('scans active JSX sources only', () => {
  assert.equal(isScannedPath('apps/web/src/page.tsx'), true);
  assert.equal(isScannedPath('packages/ui/src/a.jsx'), true);
  assert.equal(isScannedPath('apps/web/src/page.ts'), false);
  assert.equal(isScannedPath('apps/web/src/page.test.tsx'), false);
  assert.equal(isScannedPath('packages/ui/src/__tests__/a.tsx'), false);
  assert.equal(isScannedPath('apps/tanstack-web/src/page.tsx'), false);
  assert.equal(isScannedPath('apps/mobile/lib/page.tsx'), false);
});

test('totals let a move between files keep the same budget', () => {
  assert.equal(total({ 'apps/a.tsx': 2, 'apps/b.tsx': 1 }), 3);
  assert.equal(total({}), 0);
});

test('baseline comparison: new files and growth regress', () => {
  const baseline = { 'apps/a.tsx': 2, 'apps/b.tsx': 1 };
  const { regressions, improvements } = compareToBaseline(
    { 'apps/a.tsx': 3, 'apps/c.tsx': 1 },
    baseline
  );
  assert.deepEqual(regressions, [
    { file: 'apps/a.tsx', count: 3, allowed: 2 },
    { file: 'apps/c.tsx', count: 1, allowed: 0 },
  ]);
  assert.deepEqual(improvements, [
    { file: 'apps/b.tsx', count: 0, allowed: 1 },
  ]);
});

test('counts occurrences per file from disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loading-text-'));
  try {
    fs.mkdirSync(path.join(root, 'apps/x'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'apps/x/a.tsx'),
      "<p>{t('loading')}</p>\n<p>Loading...</p>\n"
    );
    fs.writeFileSync(path.join(root, 'apps/x/b.tsx'), '<p>Ready</p>\n');
    assert.deepEqual(
      collectCounts({ rootDir: root, files: ['apps/x/a.tsx', 'apps/x/b.tsx'] }),
      { 'apps/x/a.tsx': 2 }
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the repository matches its loading-text baseline', () => {
  const baseline = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'visible-loading-text-baseline.json'),
      'utf8'
    )
  );
  // Removals are fine (parallel lanes tighten the baseline later); growth
  // in any file is not.
  const { regressions } = compareToBaseline(collectCounts(), baseline);
  assert.deepEqual(
    regressions,
    [],
    'Render a skeleton from @tuturuuu/ui/skeleton instead of visible loading text'
  );
});
