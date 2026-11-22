import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

/** Directories whose code checks external-app (`ttr_app_`) bearer scopes. */
const SCOPE_CHECK_DIRS = [
  'apps/web/src/lib/external-apps',
  'apps/web/src/lib/external-ai',
  'apps/web/src/lib/external-projects',
  'apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/external-apps',
  'apps/workspace/src/lib/external-projects',
];

/** Files that must match scopes through `hasGrantedScope`. */
const SHARED_MATCHER_FILES = [
  'apps/web/src/lib/external-apps/workspace-cron.ts',
  'apps/web/src/lib/external-apps/workspace-drive.ts',
  'apps/web/src/lib/external-apps/workspace-members.ts',
  'apps/web/src/lib/external-ai/auth.ts',
  'apps/web/src/lib/external-projects/access-mode.ts',
  'apps/workspace/src/lib/external-projects/access-mode.ts',
];

// A local wildcard rule: `endsWith(':*')`, a literal wildcard lookup, or a
// hand-written `hasScope`/`scopeAllowed` helper.
const LOCAL_MATCHER =
  /endsWith\(\s*['"]:\*['"]\s*\)|includes\(\s*['"][a-z.:-]*\*['"]\s*\)|scope\s*===\s*['"]\*['"]|function\s+(?:hasScope|scopeAllowed)\b/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry) && !/\.test\.tsx?$/u.test(entry)
      ? [path]
      : [];
  });
}

describe('external-app scope matching', () => {
  it('has no local wildcard matcher in route scope checks', () => {
    const offenders = SCOPE_CHECK_DIRS.flatMap((dir) =>
      sourceFiles(join(repoRoot, dir))
    )
      .filter((path) => LOCAL_MATCHER.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repoRoot, path));

    expect(offenders).toEqual([]);
  });

  it.each(SHARED_MATCHER_FILES)('%s uses hasGrantedScope', (file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    expect(source).toContain(
      "from '@tuturuuu/utils/external-app-registry-policy'"
    );
    expect(source).toMatch(/hasGrantedScope\(/u);
  });
});
