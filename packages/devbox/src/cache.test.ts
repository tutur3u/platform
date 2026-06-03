import { describe, expect, it } from 'vitest';
import {
  createDevboxCacheKey,
  getCacheCompatibility,
  planCacheEvictions,
} from './cache';

describe('devbox cache planning', () => {
  const baseInput = {
    bunVersion: '1.3.14',
    cacheSchemaVersion: 1,
    commandProfile: 'bun-check',
    lockfileHash: 'lock-a',
    nodeVersion: '22.18.0',
    platform: 'linux/arm64',
    repoFingerprint: 'repo-a',
    runtimeImageDigest: 'sha256:image-a',
  } as const;

  it('builds deterministic cache keys from runtime and lockfile inputs', () => {
    expect(createDevboxCacheKey(baseInput)).toBe(
      createDevboxCacheKey({ ...baseInput })
    );
    expect(
      createDevboxCacheKey({ ...baseInput, lockfileHash: 'lock-b' })
    ).not.toBe(createDevboxCacheKey(baseInput));
  });

  it('marks legacy Bun install caches as incompatible', () => {
    expect(
      getCacheCompatibility(
        {
          bunVersion: '1.2.0',
          cacheSchemaVersion: 1,
          commandProfile: 'bun-check',
          key: 'old',
          lastUsedAt: '2026-06-01T00:00:00.000Z',
          lockfileHash: 'lock-a',
          sizeBytes: 10,
          type: 'bun-install',
        },
        baseInput
      )
    ).toMatchObject({
      compatible: false,
      reason: 'bun-version-mismatch',
    });
  });

  it('evicts incompatible caches before least-recently-used compatible caches', () => {
    const plan = planCacheEvictions(
      [
        {
          bunVersion: '1.2.0',
          cacheSchemaVersion: 1,
          commandProfile: 'bun-check',
          key: 'legacy-bun',
          lastUsedAt: '2026-06-02T00:00:00.000Z',
          lockfileHash: 'lock-a',
          sizeBytes: 70,
          type: 'bun-install',
        },
        {
          bunVersion: '1.3.14',
          cacheSchemaVersion: 1,
          commandProfile: 'bun-check',
          key: 'recent-compatible',
          lastUsedAt: '2026-06-03T00:00:00.000Z',
          lockfileHash: 'lock-a',
          sizeBytes: 60,
          type: 'bun-install',
        },
        {
          bunVersion: '1.3.14',
          cacheSchemaVersion: 1,
          commandProfile: 'bun-check',
          key: 'old-compatible',
          lastUsedAt: '2026-06-01T00:00:00.000Z',
          lockfileHash: 'lock-a',
          sizeBytes: 60,
          type: 'bun-install',
        },
      ],
      {
        activeInput: baseInput,
        maxBytes: 100,
        protectedRecentCompatibleCount: 1,
      }
    );

    expect(plan.evict.map((entry) => entry.key)).toEqual([
      'legacy-bun',
      'old-compatible',
    ]);
    expect(plan.keep.map((entry) => entry.key)).toEqual(['recent-compatible']);
  });
});
