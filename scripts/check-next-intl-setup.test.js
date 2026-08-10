const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  checkNextIntlSetup,
  discoverNextIntlApps,
} = require('./check-next-intl-setup');

function createProject(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-intl-setup-'));
  t.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));
  return rootDir;
}

function write(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeNextIntlApp(rootDir, app, { localeRoot = true } = {}) {
  write(
    rootDir,
    `apps/${app}/next.config.ts`,
    "import createNextIntlPlugin from 'next-intl/plugin';\ncreateNextIntlPlugin();\n"
  );
  write(
    rootDir,
    `apps/${app}/src/i18n/routing.ts`,
    'export const routing = {};\n'
  );
  write(
    rootDir,
    `apps/${app}/src/i18n/request.ts`,
    localeRoot
      ? 'getRequestConfig(async ({locale: localeOverride, requestLocale}) => { const locale = await resolveRootLocale([], localeOverride ?? (await requestLocale)); return {locale, messages: {}}; });\n'
      : 'getRequestConfig(async ({requestLocale}) => ({locale: await requestLocale, messages: {}}));\n'
  );
  if (localeRoot) {
    write(
      rootDir,
      `apps/${app}/src/app/[locale]/layout.tsx`,
      "import {resolveRootLocale} from '@tuturuuu/utils/i18n-root-locale'; import {locale as getRootLocale} from 'next/root-params'; export default async function Layout() { const locale = await resolveRootLocale([], await getRootLocale()); return <html lang={locale} />; }\n"
    );
  }
}

test('accepts locale-rooted and unsegmented next-intl apps', (t) => {
  const rootDir = createProject(t);
  writeNextIntlApp(rootDir, 'web');
  writeNextIntlApp(rootDir, 'shortener', { localeRoot: false });

  const result = checkNextIntlSetup(rootDir);

  assert.equal(result.apps.length, 2);
  assert.deepEqual(result.errors, []);
});

test('rejects root params and setRequestLocale in locale-rooted apps', (t) => {
  const rootDir = createProject(t);
  writeNextIntlApp(rootDir, 'web');
  write(
    rootDir,
    'apps/web/src/i18n/request.ts',
    "import {locale} from 'next/root-params'; getRequestConfig(async () => ({locale: await locale(), messages: {}}));\n"
  );
  write(
    rootDir,
    'apps/web/src/app/[locale]/page.tsx',
    'setRequestLocale("en");\n'
  );

  const { errors } = checkNextIntlSetup(rootDir);

  assert.ok(errors.some((error) => error.includes('must accept locale')));
  assert.ok(errors.some((error) => error.includes('must resolve root locale')));
  assert.ok(
    errors.some((error) => error.includes('must resolve requestLocale'))
  );
  assert.ok(
    errors.some((error) => error.includes('must not import next/root-params'))
  );
  assert.ok(errors.some((error) => error.includes('legacy setRequestLocale')));
});

test('requires html lang to come from validated root params', (t) => {
  const rootDir = createProject(t);
  writeNextIntlApp(rootDir, 'web');
  write(
    rootDir,
    'apps/web/src/app/[locale]/layout.tsx',
    'export default async function Layout() { return <html lang="en" />; }\n'
  );

  const { errors } = checkNextIntlSetup(rootDir);

  assert.ok(errors.some((error) => error.includes('import next/root-params')));
  assert.ok(errors.some((error) => error.includes('validate root locale')));
  assert.ok(errors.some((error) => error.includes('set html lang')));
});

test('rejects request-bound getLocale in locale-root layouts', (t) => {
  const rootDir = createProject(t);
  writeNextIntlApp(rootDir, 'web');
  write(
    rootDir,
    'apps/web/src/app/[locale]/layout.tsx',
    "import {getLocale} from 'next-intl/server'; export default async function Layout() { const locale = await getLocale(); return <html lang={locale} />; }\n"
  );

  const { errors } = checkNextIntlSetup(rootDir);

  assert.ok(errors.some((error) => error.includes('must not call getLocale')));
});

test('ignores Next apps that do not configure next-intl', (t) => {
  const rootDir = createProject(t);
  write(rootDir, 'apps/plain/next.config.ts', 'export default {};\n');

  assert.deepEqual(discoverNextIntlApps(rootDir), []);
});

test('discovers next-intl plugin imports with double quotes', (t) => {
  const rootDir = createProject(t);
  writeNextIntlApp(rootDir, 'web');
  write(
    rootDir,
    'apps/web/next.config.ts',
    'import createNextIntlPlugin from "next-intl/plugin";\n'
  );

  assert.equal(discoverNextIntlApps(rootDir).length, 1);
});
