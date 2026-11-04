import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: Vercel Web Analytics (`@vercel/analytics`) ran for every visitor,
 * including Vietnam, without consent, so it was turned off for all visitors.
 * This test fails if any app or package imports, mounts or depends on it again.
 * Re-enabling it needs a real consent gate and a deliberate change here.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');
const SCAN_ROOTS = ['apps', 'packages'];
const SELF = relative(REPO_ROOT, __filename).split(sep).join('/');
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  '.vercel',
  '.output',
  'dist',
  'build',
  'coverage',
  'target',
]);
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const ANALYTICS_IMPORT = /['"`]@vercel\/analytics(?:\/[^'"`]*)?['"`]/;
const WRAPPER_USE = /\bVercelAnalytics\b/;

export function findSourceViolations(source: string): string[] {
  const found: string[] = [];
  if (ANALYTICS_IMPORT.test(source)) found.push('imports @vercel/analytics');
  if (WRAPPER_USE.test(source)) found.push('uses VercelAnalytics');
  return found;
}

export function findManifestViolations(manifest: string): string[] {
  const json = JSON.parse(manifest) as Record<string, unknown>;
  return DEPENDENCY_FIELDS.filter((field) => {
    const deps = json[field];
    return (
      typeof deps === 'object' &&
      deps !== null &&
      '@vercel/analytics' in (deps as Record<string, unknown>)
    );
  }).map((field) => `declares @vercel/analytics in ${field}`);
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(relative(REPO_ROOT, join(dir, entry.name)).split(sep).join('/'));
    }
  }
}

function listRepoFiles(): string[] {
  try {
    const output = execFileSync(
      'git',
      [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        ...SCAN_ROOTS,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
    );
    const files = output.split('\0').filter(Boolean);
    if (files.length > 0) return files;
  } catch {
    // Not a git checkout; fall back to walking the tree.
  }
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  return files;
}

function read(file: string) {
  try {
    return readFileSync(join(REPO_ROOT, file), 'utf8');
  } catch {
    return null; // Deleted in the working tree but still tracked.
  }
}

describe('Vercel Web Analytics stays off', () => {
  it('detects imports, wrapper mounts and manifest entries', () => {
    expect(
      findSourceViolations(
        "import { Analytics } from '@vercel/analytics/react';"
      )
    ).toEqual(['imports @vercel/analytics']);
    expect(findSourceViolations('await import("@vercel/analytics")')).toEqual([
      'imports @vercel/analytics',
    ]);
    expect(findSourceViolations('<VercelAnalytics />')).toEqual([
      'uses VercelAnalytics',
    ]);
    expect(
      findSourceViolations(
        "import { SpeedInsights } from '@vercel/speed-insights/next';"
      )
    ).toEqual([]);
    expect(
      findManifestViolations(
        JSON.stringify({ dependencies: { '@vercel/analytics': '^2.0.1' } })
      )
    ).toEqual(['declares @vercel/analytics in dependencies']);
  });

  it('is not imported, mounted or declared anywhere in apps or packages', () => {
    const violations: string[] = [];
    const files = listRepoFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      if (file === SELF) continue;
      const isManifest = file.endsWith('/package.json');
      if (!isManifest && !SOURCE_FILE.test(file)) continue;
      const content = read(file);
      if (content === null) continue;
      const found = isManifest
        ? findManifestViolations(content)
        : findSourceViolations(content);
      for (const problem of found) violations.push(`${file}: ${problem}`);
    }

    expect(violations).toEqual([]);
  });

  it('is not declared or trusted in the root manifest', () => {
    const root = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')
    ) as { trustedDependencies?: string[] };
    expect(findManifestViolations(JSON.stringify(root))).toEqual([]);
    expect(root.trustedDependencies ?? []).not.toContain('@vercel/analytics');
  });
});
