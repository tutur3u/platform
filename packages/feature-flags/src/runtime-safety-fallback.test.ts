import { describe, expect, it } from 'vitest';
import { featureFlagCatalog, validateFlag } from './catalog';
import type { CatalogFlag } from './lifecycle.mjs';
import { ENV_FALLBACK_FORBIDDEN_KINDS } from './lifecycle.mjs';
import { evaluateRuntimeFlag } from './runtime-evaluate';

const context = { isStaff: false, userId: null, workspaceId: null };

function flag(kind: CatalogFlag['kind'], envFallback: string | null) {
  return {
    key: 'TEST_SAFETY_FLAG',
    family: 'runtime',
    kind,
    scope: 'global',
    description: 'Test flag.',
    owner: 'platform',
    createdAt: '2026-11-25',
    apps: ['web'],
    appsComplete: true,
    sources: ['packages/feature-flags/src/runtime-safety-fallback.test.ts'],
    defaults: { development: false, staging: false, production: false },
    verifiedOnProdAt: null,
    legacy: false,
    rollout: { stage: 'internal', owner: 'platform', removeBy: '2027-02-28' },
    runtime: {
      type: 'boolean',
      scopes: ['platform'],
      controllers: { platform: 'platform-admin' },
      envFallback,
      clientExposed: false,
    },
  } as CatalogFlag;
}

describe('safety flags fall back to off only', () => {
  it('rejects an envFallback on kill-switch and safety-control flags', () => {
    expect(ENV_FALLBACK_FORBIDDEN_KINDS).toEqual([
      'kill-switch',
      'safety-control',
    ]);
    for (const kind of ENV_FALLBACK_FORBIDDEN_KINDS) {
      expect(validateFlag(flag(kind, 'TEST_SAFETY_FLAG'))).toContain(
        `TEST_SAFETY_FLAG: ${kind} runtime flags fall back to off only and cannot declare an envFallback`
      );
      expect(validateFlag(flag(kind, null))).toEqual([]);
    }
  });

  it('keeps the environment fallback for other kinds', () => {
    expect(validateFlag(flag('release', 'TEST_SAFETY_FLAG'))).toEqual([]);
  });

  it('never enables a safety flag from the environment when the store is unreachable', () => {
    for (const kind of ENV_FALLBACK_FORBIDDEN_KINDS) {
      for (const rules of [null, []]) {
        const decision = evaluateRuntimeFlag({
          flag: flag(kind, 'TEST_SAFETY_FLAG'),
          context,
          rules,
          envValue: 'true',
        });
        expect(decision.enabled).toBe(false);
        expect(decision.source).toBe('default');
      }
    }
  });

  it('still applies the environment fallback to a release flag', () => {
    const decision = evaluateRuntimeFlag({
      flag: flag('release', 'TEST_SAFETY_FLAG'),
      context,
      rules: null,
      envValue: 'true',
    });
    expect(decision).toMatchObject({ enabled: true, source: 'env-fallback' });
  });

  it('keeps every catalog safety flag free of an environment fallback', () => {
    for (const entry of featureFlagCatalog.flags) {
      if (
        entry.family === 'runtime' &&
        ENV_FALLBACK_FORBIDDEN_KINDS.includes(entry.kind)
      ) {
        expect(entry.runtime?.envFallback, entry.key).toBeNull();
      }
    }
  });
});
