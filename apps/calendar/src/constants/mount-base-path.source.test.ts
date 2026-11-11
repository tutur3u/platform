import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CALENDAR_ROOT_ORIGIN } from './calendar-origins';

const appRoot = resolve(__dirname, '../..');
const srcRoot = join(appRoot, 'src');
const ORIGINS_MODULE = 'src/constants/calendar-origins.ts';
const SUBDOMAIN_HOST = new URL(CALENDAR_ROOT_ORIGIN).hostname;
const FIRST_PARTY_DOMAINS = ['tuturuuu', 'tutur3u'].map(
  (name) => `${name}.com`
);
const URL_END = /[\s'"`<>()\\{}]/u;

function isFirstPartyHost(hostname: string) {
  return FIRST_PARTY_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

/** Hostnames of the first-party http(s) URLs written in `text`. */
function firstPartyUrlHosts(text: string) {
  const hosts: string[] = [];
  for (const scheme of ['http://', 'https://']) {
    let from = text.indexOf(scheme);
    while (from !== -1) {
      let end = from + scheme.length;
      while (end < text.length && !URL_END.test(text.charAt(end))) end += 1;
      try {
        const { hostname } = new URL(text.slice(from, end));
        if (isFirstPartyHost(hostname)) hosts.push(hostname);
      } catch {
        // Not a complete URL (for example a template placeholder).
      }
      from = text.indexOf(scheme, end);
    }
  }
  return hosts;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|mts)$/u.test(name) &&
      !/\.(?:test|test-utils|gen)\.(?:ts|tsx)$/u.test(name) &&
      !/\.bridge\.gen\.ts$/u.test(name)
      ? [path]
      : [];
  });
}

const rel = (path: string) => relative(appRoot, path);
const read = (path: string) => readFileSync(join(appRoot, path), 'utf8');

describe('Calendar origin and base path split', () => {
  it('spells the Calendar subdomain only in the origins module', () => {
    const offenders = [
      ...sourceFiles(srcRoot).map(rel),
      'vite.config.mts',
    ].filter(
      (path) => path !== ORIGINS_MODULE && read(path).includes(SUBDOMAIN_HOST)
    );
    expect(offenders).toEqual([]);
    expect(read(ORIGINS_MODULE)).toContain(SUBDOMAIN_HOST);
  });

  it('detects first-party hosts by parsed hostname', () => {
    expect(firstPartyUrlHosts(`fetch('${CALENDAR_ROOT_ORIGIN}/x')`)).toEqual([
      SUBDOMAIN_HOST,
    ]);
    expect(firstPartyUrlHosts('a "https://tuturuuu.com/calendar" b')).toEqual([
      'tuturuuu.com',
    ]);
    expect(firstPartyUrlHosts('`http://x.tutur3u.com:7806/p`')).toEqual([
      'x.tutur3u.com',
    ]);
    expect(
      firstPartyUrlHosts(
        'https://github.com/tutur3u/platform https://nottuturuuu.com https://tuturuuu.com.evil.test http://localhost:7806'
      )
    ).toEqual([]);
  });

  it.each([
    'vite.config.mts',
    'src/constants/configs.ts',
    'src/constants/common.ts',
    'src/constants/site-urls.ts',
    'src/app/[locale]/layout.tsx',
    'src/app/[locale]/(auth)/login/page.tsx',
    'src/routes/__root.tsx',
  ])('builds URLs in %s without a hard-coded host', (path) => {
    expect(firstPartyUrlHosts(read(path))).toEqual([]);
  });

  it('feeds the layout metadata from the mount-aware site config', () => {
    const layout = read('src/app/[locale]/layout.tsx');
    expect(layout).toContain('getSiteConfig()');
    expect(layout).toContain('manifest: site.manifest');
    expect(layout).toContain('icons: site.icons');
    expect(layout).not.toContain('siteConfig.url');
  });

  it('selects the manifest link by mount in the root route', () => {
    expect(read('src/routes/__root.tsx')).toContain(
      'withAppBase(manifestPathFor(runtimeAppBase()))'
    );
  });

  it('routes every raw browser API call through the base-aware fetch', () => {
    const offenders = sourceFiles(srcRoot)
      .map(rel)
      .filter((path) => !path.startsWith('src/app/api/'))
      .filter((path) => path !== 'src/runtime/calendar-api-path.ts')
      .filter((path) => /(?<![.\w])fetch\(\s*[`'"]\/api\//u.test(read(path)));
    expect(offenders).toEqual([]);
  });

  it('uses the base-aware fetch in the workspace calendar preferences', () => {
    const source = read(
      'src/components/settings/calendar/workspace-calendar-preferences.tsx'
    );
    expect(source.match(/calendarFetch\(/gu)).toHaveLength(3);
    expect(source).not.toMatch(/(?<![.\w])fetch\(/u);
  });
});
