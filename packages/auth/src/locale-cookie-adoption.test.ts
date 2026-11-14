import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '../../..');
const appsRoot = join(repoRoot, 'apps');

const NEXT_INTL_MIDDLEWARE_IMPORT =
  /\bfrom\s*(['"])next-intl\/middleware\1|\bimport\(\s*(['"])next-intl\/middleware\2\s*\)|\brequire\(\s*(['"])next-intl\/middleware\3\s*\)/u;

/**
 * Next.js request entry points. `middleware.ts` is the pre-16 name of
 * `proxy.ts`; both may sit at the app root or under `src/`.
 */
const ENTRY_FILES = [
  'src/proxy.ts',
  'src/middleware.ts',
  'proxy.ts',
  'middleware.ts',
];

/**
 * next-intl users outside an entry file whose `NEXT_LOCALE` cookie is not yet
 * scoped by the locale cookie helper. The central web and workspace proxies
 * run next-intl from `lib/locale-proxy.ts`; their scope is tracked separately
 * from the satellite proxies. Adding an entry here needs a security review.
 */
const UNSCOPED_INDIRECT_USERS = [
  'apps/web/src/lib/locale-proxy.ts',
  'apps/workspace/src/lib/locale-proxy.ts',
];

const appDirectories = readdirSync(appsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const readSource = (file: string) => readFileSync(join(repoRoot, file), 'utf8');
const usesNextIntlMiddleware = (file: string) =>
  NEXT_INTL_MIDDLEWARE_IMPORT.test(readSource(file));

const intlEntryFiles = appDirectories
  .flatMap((app) => ENTRY_FILES.map((entry) => `apps/${app}/${entry}`))
  .filter((file) => existsSync(join(repoRoot, file)))
  .filter(usesNextIntlMiddleware);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|mts|js|mjs)$/u.test(entry.name) &&
      !/\.test\.[cm]?[jt]sx?$/u.test(entry.name)
      ? [relative(repoRoot, path).split('\\').join('/')]
      : [];
  });
}

const indirectIntlUsers = appDirectories
  .map((app) => join(appsRoot, app, 'src'))
  .filter((directory) => existsSync(directory))
  .flatMap(sourceFiles)
  .filter((file) => !intlEntryFiles.includes(file))
  .filter(usesNextIntlMiddleware);

describe('locale cookie scope adoption', () => {
  it('matches single- and double-quoted next-intl middleware imports', () => {
    expect(
      NEXT_INTL_MIDDLEWARE_IMPORT.test(
        "import createIntlMiddleware from 'next-intl/middleware';"
      )
    ).toBe(true);
    expect(
      NEXT_INTL_MIDDLEWARE_IMPORT.test(
        'import createIntlMiddleware from "next-intl/middleware";'
      )
    ).toBe(true);
    expect(
      NEXT_INTL_MIDDLEWARE_IMPORT.test('await import("next-intl/middleware")')
    ).toBe(true);
    expect(
      NEXT_INTL_MIDDLEWARE_IMPORT.test("from 'next-intl/middleware-extra'")
    ).toBe(false);
  });

  it('finds the satellite proxies that run next-intl', () => {
    expect(intlEntryFiles.length).toBeGreaterThan(20);
  });

  it.each(intlEntryFiles)('%s exports a locale-cookie-scoped proxy', (file) => {
    const source = readSource(file);

    expect(source).toMatch(
      /(?:export const (?:proxy|middleware)|const (?:proxy|middleware)) = with(?:Canonical|Secure)LocaleCookie\(/u
    );
    expect(source).not.toMatch(
      /export (?:default )?(?:async )?function (?:proxy|middleware)\b/u
    );
    expect(source).not.toMatch(
      /getTuturuuuSharedCookieOptions\(\s*LOCALE_COOKIE_OPTIONS,\s*request\s*\)/u
    );
  });

  it('runs next-intl outside an entry file only where it is tracked', () => {
    expect(indirectIntlUsers.sort()).toEqual(
      [...UNSCOPED_INDIRECT_USERS].sort()
    );
  });
});
