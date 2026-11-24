import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/satellite'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

const SATELLITE_PROVIDERS = "from '@tuturuuu/satellite/providers'";
const PRE_PAINT_TAG = /<SorbetPrePaintScript\b[^>]*>/g;

/** Whether `layout` renders the shared satellite Providers. */
function usesSatelliteProviders(app: string, layout: string) {
  if (layout.includes(SATELLITE_PROVIDERS)) return true;
  if (!layout.includes("from '@/components/providers'")) return false;
  const local = resolve(repoRoot, 'apps', app, 'src/components/providers.tsx');
  if (!existsSync(local)) return false;
  return readFileSync(local, 'utf8').includes(SATELLITE_PROVIDERS);
}

/*
  Checks the root [locale]/layout.tsx only, for Providers imported from the
  satellite package directly or through @/components/providers. Providers
  rendered from a nested component, or a tag with a `>` inside an attribute
  before `nonce`, are outside what this text check can see.
*/
describe('bridged app providers', () => {
  it('pass the CSP nonce to the theme and Sorbet scripts', () => {
    const appsDir = resolve(repoRoot, 'apps');
    const missing: string[] = [];
    let checked = 0;

    for (const app of readdirSync(appsDir)) {
      // Apps served by the Start bridge run under its strict script policy.
      if (!existsSync(resolve(appsDir, app, 'src/start.ts'))) continue;
      const path = resolve(appsDir, app, 'src/app/[locale]/layout.tsx');
      if (!existsSync(path)) continue;
      const layout = readFileSync(path, 'utf8');
      if (!usesSatelliteProviders(app, layout)) continue;
      checked += 1;

      const tags = layout.match(/<Providers\b[^>]*>/g) ?? [];
      if (tags.some((tag) => !/\bnonce=\{requestNonce\(\)\}/.test(tag))) {
        missing.push(app);
      }
    }

    expect(checked).toBeGreaterThan(5);
    expect(missing).toEqual([]);
  });

  it('stamp the nonce on every Sorbet pre-paint script they render', () => {
    const roots = [resolve(repoRoot, 'packages/satellite/src/providers')];
    for (const app of readdirSync(resolve(repoRoot, 'apps'))) {
      const appDir = resolve(repoRoot, 'apps', app);
      if (!existsSync(resolve(appDir, 'src/start.ts'))) continue;
      for (const dir of ['src', 'roadmap']) {
        if (existsSync(resolve(appDir, dir))) roots.push(resolve(appDir, dir));
      }
    }

    const missing: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (/\.tsx$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          const source = readFileSync(path, 'utf8');
          const tags = source.match(PRE_PAINT_TAG) ?? [];
          if (tags.some((tag) => !/\bnonce=/.test(tag))) {
            missing.push(relative(repoRoot, path));
          }
        }
      }
    };
    for (const root of roots) visit(root);

    expect(missing).toEqual([]);
  });
});
