import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  name?: string;
  main?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  exports?: unknown;
}

// Tests run from the app directory (`vitest run` in apps/learn).
const repoRoot = resolve(process.cwd(), '../..');
const readJson = <T>(...segments: string[]): T =>
  JSON.parse(readFileSync(join(repoRoot, ...segments), 'utf8')) as T;

const learn = readJson<PackageManifest>('apps/learn/package.json');

function pointsAtDist(manifest: PackageManifest) {
  return JSON.stringify([manifest.main, manifest.exports]).includes('/dist/');
}

// The Worker build bundles every workspace import. A package whose entry
// points are `dist/` files only resolves once it has been built, so a clean
// checkout needs the upstream packages built before `vp build` runs.
describe('Learn Worker build from a clean checkout', () => {
  it('builds the upstream workspace packages before the Worker build', () => {
    const prebuild = learn.scripts?.['prebuild:cloudflare'];
    expect(prebuild).toBeDefined();
    expect(prebuild).toMatch(/^turbo run build\b/u);
    expect(prebuild).toContain('--filter=@tuturuuu/learn^...');
  });

  it('keeps the Worker build command itself unchanged', () => {
    expect(learn.scripts?.['build:cloudflare']).toBe(
      'vp build --configLoader runner'
    );
  });

  it('lets turbo build dependencies first', () => {
    const turbo = readJson<{ tasks: Record<string, { dependsOn?: string[] }> }>(
      'turbo.json'
    );
    expect(turbo.tasks.build?.dependsOn).toContain('^build');
  });

  it('gives every dist-backed workspace dependency a build script', () => {
    const workspaceDeps = Object.entries(learn.dependencies ?? {}).filter(
      ([, range]) => range.startsWith('workspace:')
    );
    const distBacked: string[] = [];
    for (const [name] of workspaceDeps) {
      const directory = name.replace('@tuturuuu/', '');
      const manifest = readJson<PackageManifest>(
        'packages',
        directory,
        'package.json'
      );
      if (!pointsAtDist(manifest)) continue;
      distBacked.push(name);
      expect(
        manifest.scripts?.build,
        `${name} has no build script`
      ).toBeTruthy();
    }
    expect(distBacked).toContain('@tuturuuu/internal-api');
  });
});
