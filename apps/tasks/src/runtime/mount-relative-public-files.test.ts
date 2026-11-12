import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicFile = (name: string) =>
  // Vitest runs from the app root (apps/tasks).
  readFileSync(resolvePath(process.cwd(), 'public', name), 'utf8');

/** Resolves a manifest member the way browsers do: against the manifest URL. */
const resolve = (value: string, manifestUrl: string) =>
  new URL(value, manifestUrl).toString();

describe('public files work at the subdomain root and under /tasks', () => {
  const manifest = JSON.parse(publicFile('site.webmanifest')) as {
    id: string;
    icons: { src: string }[];
    scope: string;
    start_url: string;
  };

  it('scopes the manifest to wherever it is served', () => {
    const sub = 'https://tasks.tuturuuu.com/site.webmanifest';
    const mount = 'https://tuturuuu.com/tasks/site.webmanifest';
    expect(resolve(manifest.scope, sub)).toBe('https://tasks.tuturuuu.com/');
    expect(resolve(manifest.start_url, sub)).toBe(
      'https://tasks.tuturuuu.com/personal'
    );
    // The subdomain install keeps its identity (id "/" before).
    expect(resolve(manifest.id, sub)).toBe('https://tasks.tuturuuu.com/');
    expect(resolve(manifest.scope, mount)).toBe('https://tuturuuu.com/tasks/');
    expect(resolve(manifest.start_url, mount)).toBe(
      'https://tuturuuu.com/tasks/personal'
    );
    for (const icon of manifest.icons) {
      expect(resolve(icon.src, mount)).toMatch(
        /^https:\/\/tuturuuu\.com\/tasks\/android-chrome-/u
      );
    }
  });

  it('never claims the whole apex', () => {
    for (const value of [manifest.id, manifest.scope, manifest.start_url]) {
      expect(value.startsWith('/')).toBe(false);
    }
  });

  it('keeps the offline page free of root-absolute URLs', () => {
    expect(publicFile('offline.html')).not.toMatch(/(?:href|src)="\//u);
  });
});
