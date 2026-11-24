import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/satellite'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

const SATELLITE_PROVIDERS = "from '@tuturuuu/satellite/providers'";

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
});
