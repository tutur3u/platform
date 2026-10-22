const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { collectRequirements, flatten } = require('./i18n-rendered-keys');

const checker = path.join(__dirname, 'i18n-rendered-keys.js');
function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-rendered-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, value) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(
    target,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
}
function run(root) {
  const result = spawnSync('bun', [checker, 'apps/mind', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  return {
    ...result,
    report: result.stdout.startsWith('{') ? JSON.parse(result.stdout) : null,
  };
}

function fixture(t) {
  const root = project(t);
  write(root, 'packages/ui/package.json', {
    exports: { './*': './src/*.tsx' },
  });
  write(
    root,
    'apps/mind/src/app/layout.tsx',
    `
    import { Shell } from '@tuturuuu/ui/shell';
    import type { Unrelated } from '@tuturuuu/ui/unrelated';
    export default Shell;
  `
  );
  write(
    root,
    'packages/ui/src/shell.tsx',
    `
    export { Shell } from './nested/shell';
  `
  );
  write(
    root,
    'packages/ui/src/nested/shell.tsx',
    `
    import { useTranslations } from 'next-intl';
    export function Shell() {
      const t = useTranslations('common');
      return <div>{t('home')}{t.rich('welcome')}{t(
        restoring === 'restore' ? 'restored' : 'hidden'
      )}{t(\x60themes.\x24{theme}\x60)}</div>;
    }
    const Dialog = lazy(() => import('./dialog'));
  `
  );
  write(
    root,
    'packages/ui/src/nested/dialog.tsx',
    `
    import { getTranslations } from 'next-intl/server';
    async function Dialog() { const translate = await getTranslations({locale: 'en', namespace: 'settings'}); return translate('close'); }
  `
  );
  write(
    root,
    'packages/ui/src/unrelated.tsx',
    `
    function Unrelated() { const t = useTranslations('finance'); return t('unrelated'); }
  `
  );
  const messages = {
    common: {
      home: 'Home',
      welcome: 'Welcome',
      hidden: 'Hidden',
      restored: 'Restored',
      themes: { light: 'Light', dark: 'Dark' },
    },
    settings: { close: 'Close' },
    finance: { unrelated: 'Unrelated' },
  };
  write(root, 'apps/web/messages/en.json', messages);
  const { finance: _finance, ...scoped } = messages;
  for (const locale of ['en', 'vi'])
    write(root, `apps/mind/messages/${locale}.json`, scoped);
  return root;
}

test('traces transitive exports and lazy imports, scopes to rendered modules and skips type imports', (t) => {
  const result = run(fixture(t));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.report.required['common.home'].length, 1);
  assert.ok(result.report.required['settings.close']);
  assert.ok(result.report.required['common.themes.dark']);
  assert.equal(result.report.required.restore, undefined);
  assert.equal(result.report.required['finance.unrelated'], undefined);
  assert.deepEqual(result.report.missing, []);
});

test('fails for missing literal and dynamic keys in each locale independently', (t) => {
  const root = fixture(t);
  const en = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/mind/messages/en.json'))
  );
  const vi = structuredClone(en);
  delete en.common.home;
  delete vi.common.themes.dark;
  write(root, 'apps/mind/messages/en.json', en);
  write(root, 'apps/mind/messages/vi.json', vi);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.deepEqual(
    result.report.missing.map(({ locale, key }) => [locale, key]),
    [
      ['en', 'common.home'],
      ['vi', 'common.themes.dark'],
    ]
  );
});

test('rejects unresolved dynamic translation expressions and unresolved workspace imports', (t) => {
  const root = fixture(t);
  write(
    root,
    'packages/ui/src/nested/dialog.tsx',
    `function Dialog() { const t = useTranslations('settings'); return t(key); }`
  );
  assert.match(run(root).stderr, /Unresolved translation expression key/);
  write(
    root,
    'packages/ui/src/nested/dialog.tsx',
    `function Dialog() { const t = useTranslations('settings'); return t(open ? 'close' : key); }`
  );
  assert.match(run(root).stderr, /Unresolved translation expression key/);
  write(
    root,
    'packages/ui/src/nested/dialog.tsx',
    `function First() { const t = useTranslations('settings'); return t('close'); }
     function Second() { const t = useTranslations('common'); return t('home'); }`
  );
  assert.match(run(root).stderr, /Conflicting translator namespaces/);
  write(
    root,
    'packages/ui/src/nested/dialog.tsx',
    `export { Missing } from './missing';`
  );
  assert.match(run(root).stderr, /Cannot trace \.\/missing/);
});

test('checks forwarded translators and finite property keys without comparison literals', (t) => {
  const root = project(t);
  const file =
    'packages/ui/src/components/ui/custom/satellite-theme-dropdown-items.tsx';
  write(
    root,
    file,
    `function Themes({t}) { return t(selected === 'enabled' ? 'light' : 'dark'); }`
  );
  const keys = collectRequirements(root, [path.join(root, file)], new Map());
  assert.deepEqual([...keys.keys()].sort(), ['common.dark', 'common.light']);
  const local = 'apps/mind/src/app/page.tsx';
  write(
    root,
    local,
    `function Page(){ const t = useTranslations('mind'); return t(config.labelKey); } const config = { labelKey: 'actions.saved' };`
  );
  assert.deepEqual(
    [...collectRequirements(root, [path.join(root, local)], new Map()).keys()],
    ['mind.actions.saved']
  );
});

test('real Mind closure rejects pre-fix bundles and preserves canonical values', (t) => {
  const repo = path.resolve(__dirname, '..');
  const root = project(t);
  fs.symlinkSync(
    path.join(repo, 'packages'),
    path.join(root, 'packages'),
    'dir'
  );
  fs.mkdirSync(path.join(root, 'apps/mind'), { recursive: true });
  fs.symlinkSync(
    path.join(repo, 'apps/mind/src'),
    path.join(root, 'apps/mind/src'),
    'dir'
  );
  const added = [
    'common.dark',
    'common.guest_access',
    'common.hidden',
    'common.home',
    'common.light',
    'common.members',
    'common.no_results_found',
    'common.select_workspace',
    'search.search',
    'settings.back_to_app',
    'settings.manage_settings',
    'settings.search_settings_placeholder',
  ];
  for (const locale of ['en', 'vi']) {
    const canonical = JSON.parse(
      fs.readFileSync(path.join(repo, `apps/web/messages/${locale}.json`))
    );
    write(root, `apps/web/messages/${locale}.json`, canonical);
    const bundle = JSON.parse(
      fs.readFileSync(path.join(repo, `apps/mind/messages/${locale}.json`))
    );
    const values = flatten(bundle);
    for (const key of added) {
      assert.equal(values.get(key), flatten(canonical).get(key));
      const parts = key.split('.');
      const leaf = parts.pop();
      delete parts.reduce((obj, part) => obj[part], bundle)[leaf];
    }
    write(root, `apps/mind/messages/${locale}.json`, bundle);
  }
  const result = run(root);
  assert.equal(result.status, 1, result.stderr);
  for (const locale of ['en', 'vi'])
    assert.deepEqual(
      result.report.missing
        .filter((item) => item.locale === locale)
        .map((item) => item.key)
        .sort(),
      added
    );
});
