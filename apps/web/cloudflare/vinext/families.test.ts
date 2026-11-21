import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_DIR,
  familyOwns,
  inSubtree,
  loadFamilies,
  PROBE_ENTRIES,
  routePathFor,
} from '../opennext/prune';
import { loadVinextFamilies, planVinextPrune } from './prune';

const { config } = loadVinextFamilies();
const { deny } = loadFamilies().config;

describe('vinext route families', () => {
  it('excludes every sharp entry from every family', () => {
    for (const family of config.families) {
      for (const entry of config.sharpExclude) {
        expect(familyOwns(family, deny, entry)).toBe(false);
      }
    }
  });

  it('assigns each app route entry to at most one family', () => {
    const plans = config.families
      .filter((family) => family.enabled)
      .map((family) => planVinextPrune(family.id));
    const owners = new Map<string, string>();
    for (const plan of plans) {
      for (const rel of plan.keep) {
        if (PROBE_ENTRIES.includes(rel)) continue;
        expect(owners.get(rel), rel).toBeUndefined();
        owners.set(rel, plan.family);
      }
    }
  });

  it('keeps the globally denied API paths out of api-core', () => {
    const plan = planVinextPrune('api-core');
    for (const rel of plan.keep) {
      const routePath = routePathFor(rel);
      expect(routePath).not.toBeNull();
      expect(
        deny.some((entry) => inSubtree(routePath as string, entry)),
        rel
      ).toBe(false);
    }
  });

  it('keeps the localized sign-in and landing pages in public-auth', () => {
    const { keep } = planVinextPrune('public-auth');
    expect(keep).toContain('[locale]/(auth)/login/page.tsx');
    expect(keep).toContain('[locale]/(marketing)/(landing)/page.tsx');
    expect(keep.some((rel) => rel.includes('(marketing)/changelog'))).toBe(
      false
    );
  });

  // vinext compiles every kept entry, so an entry that imports another
  // route entry (a page re-rendering a sibling page) needs both in one family.
  it('keeps every route entry that a kept entry imports', () => {
    const appSrc = path.join(DEFAULT_APP_DIR, 'src/app');
    const importPattern = /(?:from|import\()\s*['"]((?:\.|@\/)[^'"]+)['"]/g;
    for (const family of config.families.filter((f) => f.enabled)) {
      const { keep, remove } = planVinextPrune(family.id);
      const removed = new Set(remove.map((rel) => path.join(appSrc, rel)));
      for (const rel of keep) {
        const file = path.join(appSrc, rel);
        for (const [, spec] of readFileSync(file, 'utf8').matchAll(
          importPattern
        )) {
          const target = spec.startsWith('@/')
            ? path.join(DEFAULT_APP_DIR, 'src', spec.slice(2))
            : path.resolve(path.dirname(file), spec);
          const hit = ['', '.ts', '.tsx'].find((ext) =>
            removed.has(target + ext)
          );
          expect(hit, `${family.id}: ${rel} imports ${spec}`).toBeUndefined();
        }
      }
    }
  });
});
