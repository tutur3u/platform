import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

const apps = [
  'ai',
  'calendar',
  'chat',
  'cms',
  'colab',
  'contacts',
  'drive',
  'finance',
  'forms',
  'git',
  'infrastructure',
  'inventory',
  'learn',
  'lettin',
  'mail',
  'meet',
  'mind',
  'parley',
  'rewise',
  'storefront',
  'tasks',
  'teach',
  'track',
  'web',
  'workspace',
];

const menuSource = readFileSync(
  new URL(
    '../../../../packages/ui/src/components/ui/custom/satellite-account-switcher-menu.tsx',
    import.meta.url
  ),
  'utf8'
);
const menuKeys = [
  ...new Set(
    Array.from(menuSource.matchAll(/\bt\('([^']+)'\)/g)).flatMap(([, key]) =>
      key ? [key] : []
    )
  ),
];

const locales = ['en', 'vi'] as const;

describe.each(apps)('%s shared account switcher catalog', (app) => {
  it.each(locales)('resolves every menu and toast key in %s', (locale) => {
    expect(menuKeys).toContain('switch_account_error');
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../../../${app}/messages/${locale}.json`, import.meta.url),
        'utf8'
      )
    );
    const isColab = app === 'colab';
    const messages: Record<string, string> =
      (isColab ? catalog.shell : catalog.account_switcher) ?? {};
    const t = createTranslator({
      locale,
      messages: { account_switcher: isColab ? {} : messages },
      namespace: 'account_switcher',
    });
    for (const key of menuKeys) {
      // Colab's shell lookup uses flat dotted keys instead of next-intl.
      const path = `account_switcher.${key}`;
      const value = isColab ? (messages[path] ?? path) : t(key);
      expect(value, path).toSatisfy(
        (value: unknown) =>
          typeof value === 'string' && value.trim() !== '' && value !== path
      );
    }
  });
});
