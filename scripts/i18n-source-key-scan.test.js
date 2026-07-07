const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  checkAppSourceKeys,
  scanSourceKeys,
} = require('./i18n-source-key-scan');

function createProject(t) {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'i18n-source-key-scan-')
  );
  t.after(() => {
    fs.rmSync(projectRoot, { force: true, recursive: true });
  });
  return projectRoot;
}

function writeFile(projectRoot, relativePath, content) {
  const filePath = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(projectRoot, relativePath, value) {
  writeFile(projectRoot, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('scanSourceKeys captures bare and namespaced translators in the same file', (t) => {
  const projectRoot = createProject(t);
  writeFile(
    projectRoot,
    'packages/ui/src/sample.tsx',
    `
      import { useTranslations } from 'next-intl';

      export function Sample() {
        const t = useTranslations();
        const settingsT = useTranslations('settings.finance');
        return (
          <>
            {t('ws-invoices.prepaid_months')}
            {settingsT('transaction_defaults_badge')}
          </>
        );
      }
    `
  );

  assert.deepEqual(scanSourceKeys(projectRoot, 'packages/ui/src'), [
    {
      file: 'packages/ui/src/sample.tsx',
      key: 'ws-invoices.prepaid_months',
      namespace: '',
    },
    {
      file: 'packages/ui/src/sample.tsx',
      key: 'transaction_defaults_badge',
      namespace: 'settings.finance',
    },
  ]);
});

test('scanSourceKeys captures static conditional keys without option fallback strings', (t) => {
  const projectRoot = createProject(t);
  writeFile(
    projectRoot,
    'packages/ui/src/conditional.tsx',
    `
      import { useTranslations } from 'next-intl';

      export function Conditional({ isRange }: { isRange: boolean }) {
        const t = useTranslations();
        return (
          <>
            {t(
              isRange
                ? 'ws-invoices.some_groups_unpaid_for_range'
                : 'ws-invoices.some_groups_unpaid_for_month'
            )}
            {t('ws-invoices.combined_attendance_for_month', {
              count: 2,
              default: 'Combined fallback should not be reported',
            })}
          </>
        );
      }
    `
  );

  assert.deepEqual(scanSourceKeys(projectRoot, 'packages/ui/src'), [
    {
      file: 'packages/ui/src/conditional.tsx',
      key: 'ws-invoices.some_groups_unpaid_for_range',
      namespace: '',
    },
    {
      file: 'packages/ui/src/conditional.tsx',
      key: 'ws-invoices.some_groups_unpaid_for_month',
      namespace: '',
    },
    {
      file: 'packages/ui/src/conditional.tsx',
      key: 'ws-invoices.combined_attendance_for_month',
      namespace: '',
    },
  ]);
});

test('checkAppSourceKeys does not use shared package key exceptions for local app source', (t) => {
  const projectRoot = createProject(t);
  writeJson(projectRoot, 'apps/finance/messages/en.json', {
    settings: {
      finance: {},
    },
  });
  writeFile(
    projectRoot,
    'apps/finance/src/settings.tsx',
    `
      import { useTranslations } from 'next-intl';

      export function Settings() {
        const t = useTranslations('settings.finance');
        return t('transaction_defaults_badge');
      }
    `
  );

  const failures = checkAppSourceKeys({
    exceptions: {
      keyExceptions: {
        'apps/finance': ['settings.*'],
      },
    },
    rootDir: projectRoot,
  });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].appDir, 'apps/finance');
  assert.deepEqual(
    failures[0].missing.map(({ namespace, key }) => `${namespace}.${key}`),
    ['settings.finance.transaction_defaults_badge']
  );

  assert.deepEqual(
    checkAppSourceKeys({
      exceptions: {
        appSourceKeyExceptions: {
          'apps/finance': ['settings.finance.transaction_defaults_badge'],
        },
      },
      rootDir: projectRoot,
    }),
    []
  );
});
