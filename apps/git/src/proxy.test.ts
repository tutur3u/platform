import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function matchesProxy(pathname: string) {
  const source = readFileSync(new URL('./proxy.ts', import.meta.url), 'utf8');
  const sourceMatcher = source.match(/matcher: \['([^']+)'\]/u)?.[1];
  if (!sourceMatcher) throw new Error('Git proxy matcher was not found');
  const matcher = sourceMatcher.replaceAll('\\\\', '\\');
  return new RegExp(`^${matcher}$`, 'u').test(pathname);
}

describe('Git proxy matcher', () => {
  it.each([
    '/tutur3u/platform/blob/turbo.json',
    '/tutur3u/platform/blob/apps/git/package.json',
    '/tutur3u/platform/blob/SECURITY.md',
  ])(
    'routes repository files containing dots through locale handling',
    (path) => {
      expect(matchesProxy(path)).toBe(true);
    }
  );

  it.each(['/_next/static/chunk.js', '/favicon.svg'])(
    'leaves framework assets outside locale handling',
    (path) => {
      expect(matchesProxy(path)).toBe(false);
    }
  );
});
