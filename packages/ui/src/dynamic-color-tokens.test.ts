import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

// Inactive runtimes (see apps/docs/build/devops/active-runtime.mdx) and files
// owned by another lane until they adopt the shared tokens.
const IGNORED_ROOTS = new Set([
  'apps/backend',
  'apps/mobile',
  'apps/tanstack-web',
]);
const PENDING_OWNER_FILES = new Set([
  // Meet UX revamp lane: `dynamic-muted` / `dynamic-border`.
  'apps/meet/src/app/[locale]/[wsId]/meetings/[meetingId]/audio-recorder.tsx',
]);

const UTILITY_PREFIX =
  '(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|from|to|via|divide|fill|stroke|outline|decoration|shadow|accent|caret|placeholder)';

function definedDynamicColors() {
  const styles = readFileSync(
    resolve(repoRoot, 'packages/ui/src/globals.css'),
    'utf8'
  );
  return new Set(
    [...styles.matchAll(/--color-dynamic-([a-z-]+?)\s*:/gu)].map(
      (match) => match[1]
    )
  );
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

function activeSourceRoots() {
  return ['apps', 'packages'].flatMap((group) => {
    const groupDir = resolve(repoRoot, group);
    if (!existsSync(groupDir)) return [];
    return readdirSync(groupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${group}/${entry.name}`)
      .filter((root) => !IGNORED_ROOTS.has(root))
      .map((root) => resolve(repoRoot, root, 'src'));
  });
}

describe('dynamic color utilities', () => {
  it('only reference dynamic-* colors that globals.css defines', () => {
    const defined = definedDynamicColors();
    expect(defined.has('blue')).toBe(true);

    const usage = new RegExp(
      `(?<![\\w-])${UTILITY_PREFIX}-dynamic-([a-z]+(?:-[a-z0-9]+)*)(?![\\w-])`,
      'gu'
    );
    const offenders: string[] = [];

    for (const file of activeSourceRoots().flatMap(sourceFiles)) {
      const path = relative(repoRoot, file).split(sep).join('/');
      if (PENDING_OWNER_FILES.has(path) || /\.test\.tsx?$/u.test(path)) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(usage)) {
        const name = match[1];
        if (name && !defined.has(name)) {
          offenders.push(`${path}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 60_000);
});
