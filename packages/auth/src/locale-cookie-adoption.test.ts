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

const LOCALE_COOKIE_HELPER = /with(?:Canonical|Secure)LocaleCookie\s*\(/u;
const ENTRY_NAMES = ['proxy', 'middleware'] as const;

/** Adoption is the exported proxy calling the helper, whatever the binding is called. */
function exportsLocaleCookieProxy(source: string): boolean {
  const bindings = [
    ...source.matchAll(
      /(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*with(?:Canonical|Secure)LocaleCookie\s*\(/gu
    ),
  ].map((match) => match[1] ?? '');
  const exportedBinding = bindings.some((name) => {
    if (!ENTRY_NAMES.includes(name as (typeof ENTRY_NAMES)[number]))
      return false;
    return (
      new RegExp(
        `export\\s+(?:const|let)\\s+${name}\\s*=\\s*with(?:Canonical|Secure)LocaleCookie\\s*\\(`,
        'u'
      ).test(source) ||
      new RegExp(`export\\s+default\\s+${name}\\b`, 'u').test(source) ||
      new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`, 'u').test(source)
    );
  });
  if (exportedBinding) return true;
  return ['proxy', 'middleware'].some((name) =>
    exportedFunctionBodies(source, name).some(
      (body) =>
        LOCALE_COOKIE_HELPER.test(body) ||
        bindings.some((binding) =>
          new RegExp(`\\b${binding}\\s*\\(`, 'u').test(body)
        )
    )
  );
}

function exportedFunctionBodies(source: string, name: string): string[] {
  const header = new RegExp(
    `export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${name}\\b[^{]*\\{`,
    'gu'
  );
  const bodies: string[] = [];
  for (const match of source.matchAll(header)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    const body = braceBody(source, open);
    if (body !== undefined) bodies.push(body);
  }
  return bodies;
}

function braceBody(source: string, open: number): string | undefined {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return undefined;
}

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

  it('accepts a direct helper export', () => {
    expect(
      exportsLocaleCookieProxy(
        'export const proxy = withCanonicalLocaleCookie(handle, origins);'
      )
    ).toBe(true);
    expect(
      exportsLocaleCookieProxy(
        'export const middleware = withSecureLocaleCookie(handle, () => url);'
      )
    ).toBe(true);
  });

  it('accepts a default export of the helper binding', () => {
    expect(
      exportsLocaleCookieProxy(`
        const proxy = withCanonicalLocaleCookie(handleProxy, origins);
        export default proxy;
      `)
    ).toBe(true);
  });

  it('accepts an exported function that calls the helper binding', () => {
    expect(
      exportsLocaleCookieProxy(`
        const localeProxy = withCanonicalLocaleCookie(handleProxy, origins);
        export async function proxy(request: NextRequest) {
          const response = await localeProxy(request);
          return response;
        }
      `)
    ).toBe(true);
  });

  it('rejects an exported function that does not call the helper', () => {
    expect(
      exportsLocaleCookieProxy(`
        export async function proxy(request: NextRequest) {
          return handle(request);
        }
      `)
    ).toBe(false);
    expect(
      exportsLocaleCookieProxy(`
        const localeProxy = withCanonicalLocaleCookie(handleProxy, origins);
        export async function proxy(request: NextRequest) {
          return handle(request);
        }
      `)
    ).toBe(false);
  });

  it.each(intlEntryFiles)('%s exports a locale-cookie-scoped proxy', (file) => {
    const source = readSource(file);

    expect(exportsLocaleCookieProxy(source)).toBe(true);
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
