import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Source roots covered by the workspace secret reader scans. */
export const WORKSPACE_SECRET_SCAN_ROOTS = ['apps', 'packages'] as const;

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.dart'];
const SKIPPED_DIRECTORIES = new Set([
  '__tests__',
  'build',
  'dist',
  'e2e',
  'android',
  'coverage',
  'ios',
  'node_modules',
  'public',
  'test',
  'tests',
]);
// Inactive runtimes (see apps/docs/build/devops/active-runtime.mdx).
const SKIPPED_APP_ROOTS = new Set(['apps/backend', 'apps/tanstack-web']);
const SKIPPED_FILE_PATTERN =
  /(\.test\.|\.spec\.|\.fixture\.|\.gen\.|test-support|-fake\.|\.d\.ts$)/u;
const GENERATED_FILES = new Set(['packages/types/src/supabase.ts']);

/** Direct access to the table: `.from('workspace_secrets')` or an embed. */
export const WORKSPACE_SECRETS_TABLE_PATTERN =
  /['"`]workspace_secrets['"`]|(?<![\w.])workspace_secrets\s*(?:!\w+)?\s*\(/u;

function walk(root: string, dir: string, files: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(root, path).split('\\').join('/');
    if (entry.isDirectory()) {
      // Dot-directories hold tool caches and build output.
      if (entry.name.startsWith('.')) continue;
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (SKIPPED_APP_ROOTS.has(rel)) continue;
      walk(root, path, files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    if (SKIPPED_FILE_PATTERN.test(entry.name)) continue;
    if (GENERATED_FILES.has(rel)) continue;
    files.push(rel);
  }
}

/** Authored, non-test source files (repo-relative) under the scan roots. */
export function listWorkspaceSecretScanFiles(repoRoot: string) {
  const files: string[] = [];
  for (const root of WORKSPACE_SECRET_SCAN_ROOTS) {
    walk(repoRoot, join(repoRoot, root), files);
  }
  return files.sort();
}

export interface WorkspaceSecretScanSource {
  file: string;
  source: string;
}

/** Reads every scanned file once so several checks can share the pass. */
export function loadWorkspaceSecretScanSources(
  repoRoot: string
): WorkspaceSecretScanSource[] {
  return listWorkspaceSecretScanFiles(repoRoot).map((file) => ({
    file,
    source: readFileSync(join(repoRoot, file), 'utf8'),
  }));
}

/** Files whose source matches `pattern`. */
export function filterWorkspaceSecretScanMatches(
  sources: readonly WorkspaceSecretScanSource[],
  pattern: RegExp
) {
  return sources
    .filter(({ source }) => pattern.test(source))
    .map(({ file }) => file);
}

/**
 * Secret names a SQL migration compares `name` against: `name = 'X'`,
 * `name IN ('X', 'Y')` and `name = ANY (ARRAY['X', 'Y'])`, any case.
 */
export function extractSqlSecretNames(sql: string): string[] {
  const names: string[] = [];
  const literal = /'([A-Za-z0-9_:]+)'/gu;
  const lists =
    /\bname\s*(?:=\s*any\s*\(\s*array\s*\[([^\]]*)\]|in\s*\(([^)]*)\))/giu;
  for (const match of sql.matchAll(lists)) {
    const body = match[1] ?? match[2] ?? '';
    for (const item of body.matchAll(literal)) {
      if (item[1]) names.push(item[1]);
    }
  }
  for (const match of sql.matchAll(/\bname\s*=\s*'([A-Za-z0-9_:]+)'/giu)) {
    if (match[1]) names.push(match[1]);
  }
  return names;
}
