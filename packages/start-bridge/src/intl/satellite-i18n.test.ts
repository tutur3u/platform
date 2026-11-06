import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startBridgePreset } from '../vite/preset';

const appRoot = 'file:///repo/apps/cms/vite.config.ts';
const isClientModule = (path: string) =>
  /^\s*['"]use client['"]/u.test(readFileSync(path, 'utf8'));

function satelliteAliasTarget() {
  const preset = startBridgePreset({ appRoot, app: 'cms' }, {});
  return preset.alias.find(
    (alias) => String(alias.find) === '/^@tuturuuu\\/satellite\\/i18n$/u'
  )?.replacement;
}

describe('@tuturuuu/satellite/i18n server safety', () => {
  it('aliases to a server-safe entry whose locale data is not a client module', () => {
    const target = satelliteAliasTarget();
    expect(target).toMatch(/src\/intl\/satellite-i18n\.ts$/u);
    // In an RSC graph every export of a 'use client' module is a client
    // reference, so `routing.locales` would read as undefined server-side.
    expect(isClientModule(target as string)).toBe(false);
    const source = readFileSync(target as string, 'utf8');
    expect(source).toMatch(
      /export \{[^}]*\brouting\b[^}]*\} from '\.\/satellite-locales'/u
    );
    const locales = fileURLToPath(
      new URL('./satellite-locales.ts', import.meta.url)
    );
    expect(isClientModule(locales)).toBe(false);
  });

  it('gives a server-side import real routing data', async () => {
    const satellite = await import('./satellite-i18n');
    expect(satellite.routing.locales).toEqual(['en', 'vi']);
    expect(satellite.routing.defaultLocale).toBe('en');
    expect(satellite.supportedLocales).toEqual(['en', 'vi']);
    // What CMS i18n/request.ts does through resolveRequestLocale.
    expect(satellite.routing.locales.includes('vi')).toBe(true);
    expect(satellite.localize('/people', 'vi')).toBe('/vi/people');
    expect(typeof satellite.redirect).toBe('function');
    expect(typeof satellite.Link).toBe('function');
  });

  it('keeps the client module exporting the same data for existing imports', async () => {
    const client = await import('./localized-navigation');
    const server = await import('./satellite-locales');
    expect(client.routing).toBe(server.routing);
    expect(client.supportedLocales).toBe(server.supportedLocales);
  });
});
