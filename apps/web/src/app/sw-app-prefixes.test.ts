import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// sw.ts registers listeners on import, so its prefix list is read as source.
const source = readFileSync(
  fileURLToPath(new URL('./sw.ts', import.meta.url)),
  'utf8'
);

function bypassPrefixes() {
  const match = source.match(
    /const ONE_ORIGIN_APP_PREFIXES = \[([\s\S]*?)\] as const;/u
  );
  if (!match?.[1]) throw new Error('ONE_ORIGIN_APP_PREFIXES not found');
  return [...match[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1]);
}

describe('Web service worker one-origin bypass', () => {
  it('keeps every mounted app path out of the root worker', () => {
    const prefixes = bypassPrefixes();
    for (const path of [
      '/roadmap',
      '/design',
      '/tasks',
      '/calendar',
      '/finance',
      '/track',
      '/drive',
      '/learn',
      '/forms',
      '/teach',
      '/tools',
      '/cms',
      '/apps',
      '/store',
      '/meet',
      '/mail',
    ]) {
      expect(prefixes).toContain(path);
    }
  });

  it('lists unique slash-led prefixes without a trailing slash', () => {
    const prefixes = bypassPrefixes();
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) {
      expect(prefix).toMatch(/^\/[a-z0-9-]+$/u);
    }
  });

  it('never bypasses paths Web itself serves', () => {
    const prefixes = bypassPrefixes();
    for (const path of ['/', '/login', '/products', '/pricing', '/docs']) {
      expect(prefixes).not.toContain(path);
    }
  });
});
