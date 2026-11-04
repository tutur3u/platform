import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: Vercel Web Analytics (`@vercel/analytics`) and Speed Insights
 * (`@vercel/speed-insights`) ran for every visitor, including Vietnam, without
 * consent, so both were turned off for all visitors. This test fails if any app
 * or package imports, mounts or depends on either again. Re-enabling one needs
 * a real consent gate and a deliberate change here.
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

const BANNED_PACKAGES = ['@vercel/analytics', '@vercel/speed-insights'];
const BANNED_WRAPPERS = ['VercelAnalytics', 'VercelInsights'];

const importPattern = (name: string) =>
  new RegExp(`['"\`]${name.replace('/', '\\/')}(?:\\/[^'"\`]*)?['"\`]`);
const BANNED_IMPORTS = BANNED_PACKAGES.map(
  (name) => [name, importPattern(name)] as const
);
const WRAPPER_USES = BANNED_WRAPPERS.map(
  (name) => [name, new RegExp(`\\b${name}\\b`)] as const
);

export function findSourceViolations(source: string): string[] {
  const found: string[] = [];
  for (const [name, pattern] of BANNED_IMPORTS)
    if (pattern.test(source)) found.push(`imports ${name}`);
  for (const [name, pattern] of WRAPPER_USES)
    if (pattern.test(source)) found.push(`uses ${name}`);
  return found;
}

export function findManifestViolations(manifest: string): string[] {
  const json = JSON.parse(manifest) as Record<string, unknown>;
  const found: string[] = [];
  for (const field of DEPENDENCY_FIELDS) {
    const deps = json[field];
    if (typeof deps !== 'object' || deps === null) continue;
    for (const name of BANNED_PACKAGES)
      if (name in (deps as Record<string, unknown>))
        found.push(`declares ${name} in ${field}`);
  }
  return found;
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

describe('Vercel Web Analytics and Speed Insights stay off', () => {
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
    ).toEqual(['imports @vercel/speed-insights']);
    expect(
      findSourceViolations("await import('@vercel/speed-insights')")
    ).toEqual(['imports @vercel/speed-insights']);
    expect(findSourceViolations('<VercelInsights />')).toEqual([
      'uses VercelInsights',
    ]);
    expect(
      findSourceViolations(
        "import { redactSensitiveUrl } from '@tuturuuu/vercel';"
      )
    ).toEqual([]);
    expect(
      findManifestViolations(
        JSON.stringify({
          dependencies: { '@vercel/analytics': '^2.0.1' },
          devDependencies: { '@vercel/speed-insights': '^2.0.0' },
        })
      )
    ).toEqual([
      'declares @vercel/analytics in dependencies',
      'declares @vercel/speed-insights in devDependencies',
    ]);
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
    for (const name of BANNED_PACKAGES)
      expect(root.trustedDependencies ?? []).not.toContain(name);
  });
});
