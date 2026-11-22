import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

/** Directories and files whose code checks external-app bearer scopes. */
const SCOPE_CHECK_PATHS = [
  'apps/ai/src/lib',
  'apps/admin/src/app/[locale]/(dashboard)/[wsId]/external-apps/approval-utils.ts',
  'apps/admin/src/lib/app-coordination/external-apps.ts',
  'apps/web/src/lib/app-coordination',
  'apps/web/src/lib/external-apps',
  'apps/web/src/lib/external-ai',
  'apps/web/src/lib/external-projects',
  'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-apps',
  'apps/workspace/src/lib/external-projects',
];

/** Exact source lines whose `'*'` is not a scope rule (`If-None-Match: *`). */
const NON_SCOPE_WILDCARD_LINES: Readonly<Record<string, string>> = {
  'apps/web/src/lib/external-projects/http-cache.ts':
    "trimmed === '*' || normalizeEntityTag(trimmed) === normalizedResponse",
};

/** Files that must match scopes through `hasGrantedScope`. */
const SHARED_MATCHER_FILES = [
  'apps/web/src/lib/external-apps/workspace-cron.ts',
  'apps/web/src/lib/external-apps/workspace-drive.ts',
  'apps/web/src/lib/external-apps/workspace-members.ts',
  'apps/web/src/lib/external-ai/auth.ts',
  'apps/web/src/lib/external-projects/access-mode.ts',
  'apps/workspace/src/lib/external-projects/access-mode.ts',
  'apps/ai/src/lib/public-credential.ts',
];

// A local wildcard rule, in any quote style: `endsWith(':*')` or
// `endsWith('*')`, a literal wildcard lookup, a comparison with `'*'`, a
// prefix match on `slice(0, -1)` or `slice(0, x.length - 1)`, or a
// hand-written `hasScope`/`scopeAllowed` helper.
const Q = `['"\\x60]`;
const LOCAL_MATCHERS = [
  new RegExp(`endsWith\\(\\s*${Q}:?\\*${Q}\\s*\\)`, 'u'),
  new RegExp(`includes\\(\\s*${Q}[a-z.:-]*\\*${Q}\\s*\\)`, 'u'),
  new RegExp(`===\\s*${Q}\\*${Q}|${Q}\\*${Q}\\s*===`, 'u'),
  /startsWith\([^)]*slice\(\s*0\s*,\s*-1\s*\)/u,
  /slice\(\s*0\s*,\s*[\w.$]+\.length\s*-\s*1\s*\)/u,
  /function\s+(?:hasScope|scopeAllowed)\b/u,
];

const usesLocalMatcher = (source: string) =>
  LOCAL_MATCHERS.some((matcher) => matcher.test(source));

/** The source with its one named non-scope line removed, if it has one. */
function withoutNonScopeLine(path: string, source: string) {
  const line = NON_SCOPE_WILDCARD_LINES[path];
  if (!line) return source;
  return source
    .split('\n')
    .filter((text) => text.trim() !== line)
    .join('\n');
}

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    if (statSync(child).isDirectory()) return sourceFiles(child);
    return /\.tsx?$/u.test(entry) && !/\.test\.tsx?$/u.test(entry)
      ? [child]
      : [];
  });
}

describe('external-app scope matching', () => {
  it('has no local wildcard matcher in route scope checks', () => {
    const offenders = SCOPE_CHECK_PATHS.flatMap((path) =>
      sourceFiles(join(repoRoot, path))
    )
      .map((path) => relative(repoRoot, path))
      .filter((path) =>
        usesLocalMatcher(
          withoutNonScopeLine(path, readFileSync(join(repoRoot, path), 'utf8'))
        )
      );

    expect(offenders).toEqual([]);
  });

  it.each([
    "scope.endsWith(':*')",
    'scope.endsWith(`:*`)',
    "scopes.includes('*')",
    'scopes.includes(`workspace:*`)',
    "grant === '*'",
    "'*' === grant",
    'required.startsWith(grant.slice(0, -1))',
    "scope.endsWith('*')",
    'scope.slice(0, scope.length - 1)',
    'function hasScope(scopes: string[]) {}',
  ])('recognises the local matcher %s', (source) => {
    expect(usesLocalMatcher(source)).toBe(true);
  });

  it.each(SHARED_MATCHER_FILES)('%s uses hasGrantedScope', (file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    expect(source).toContain(
      "from '@tuturuuu/utils/external-app-registry-policy'"
    );
    expect(source).toMatch(/hasGrantedScope\(/u);
  });

  it('exempts only the named If-None-Match line', () => {
    const path = 'apps/web/src/lib/external-projects/http-cache.ts';
    const source = readFileSync(join(repoRoot, path), 'utf8');
    expect(source).toContain(NON_SCOPE_WILDCARD_LINES[path]);
    expect(
      usesLocalMatcher(withoutNonScopeLine(path, `${source}\nx === '*';`))
    ).toBe(true);
  });
});
