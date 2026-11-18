const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const checker = path.join(__dirname, 'i18n-rendered-settings.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-settings-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  function write(file, value) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  }

  const keys = { hidden_workspaces_description: 'Hidden workspaces copy' };
  const options = { compact: 'Compact', roomy: 'Roomy' };
  const bundle = { common: keys, 'settings-layout': options };
  write('apps/web/messages/en.json', bundle);
  write('packages/ui/package.json', {
    exports: {
      './workspace-settings': {
        bun: './src/workspace/settings.tsx',
        default: './dist/workspace/settings.js',
      },
    },
  });
  write(
    'packages/ui/src/workspace/settings.tsx',
    `
      import { useTranslations } from 'next-intl';
      const OPTIONS = { default: 'compact', large: 'roomy' };
      export function Layout({ choice }) {
        const common = useTranslations('common');
        const t = useTranslations('settings-layout');
        const option = OPTIONS[choice];
        return <div>{common('hidden_workspaces_description')}{t(option)}</div>;
      }
    `
  );

  return { bundle, root, write };
}

function run(root, app) {
  const result = spawnSync('bun', [checker, app, '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (!result.stdout) assert.fail(result.stderr);
  return {
    ...result,
    missing: JSON.parse(result.stdout)
      .flatMap(({ missing, surface }) =>
        missing.map(({ locale, key }) => [surface, locale, key])
      )
      .sort(),
  };
}

test('fails on missing shared workspace copy in Mail independently of locale', (t) => {
  const { bundle, root, write } = fixture(t);
  write(
    'apps/mail/src/runtime/workspace-view.tsx',
    `export { Layout as default } from '@tuturuuu/ui/workspace-settings';`
  );
  const en = structuredClone(bundle);
  const vi = structuredClone(bundle);
  delete en.common.hidden_workspaces_description;
  delete vi['settings-layout'].roomy;
  write('apps/mail/messages/en.json', en);
  write('apps/mail/messages/vi.json', vi);

  const result = run(root, 'mail');
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(result.missing, [
    ['dashboard', 'en', 'common.hidden_workspaces_description'],
    ['dashboard', 'vi', 'settings-layout.roomy'],
  ]);

  write('apps/mail/messages/en.json', bundle);
  write('apps/mail/messages/vi.json', bundle);
  const fixed = run(root, 'mail');
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.deepEqual(fixed.missing, []);
});

test('fails when a filtered client provider omits keys present in both locale bundles', (t) => {
  const { bundle, root, write } = fixture(t);
  write(
    'apps/web/src/app/[locale]/(auth)/settings/page.tsx',
    `export { Layout as default } from '@tuturuuu/ui/workspace-settings';`
  );
  write('apps/web/messages/vi.json', bundle);
  write(
    'apps/web/src/i18n/client-messages.ts',
    `
      export const AUTH_CLIENT_MESSAGE_NAMESPACES = ['settings-layout'];
      export const getClientMessages = (messages, namespaces) =>
        Object.fromEntries(namespaces.map((namespace) => [namespace, messages[namespace]]));
    `
  );

  const result = run(root, 'web');
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(result.missing, [
    ['auth', 'en', 'common.hidden_workspaces_description'],
    ['auth', 'vi', 'common.hidden_workspaces_description'],
  ]);
});
