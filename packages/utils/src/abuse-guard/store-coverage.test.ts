import { describe, expect, it } from 'vitest';
import { ABUSE_GUARD_FAMILIES } from './protocol';
import { abuseStoreCoverage } from './store-coverage';

const UPSTASH = {
  UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'fixture-token',
};
const GUARD = {
  ABUSE_GUARD_URL: 'https://guard.fixture.invalid',
  ABUSE_GUARD_SECRET: 's'.repeat(32),
  ABUSE_GUARD_KEY_PEPPER: 'p'.repeat(32),
};
const NOW = Date.parse('2026-11-15T00:00:00Z');
const stores = (env: Parameters<typeof abuseStoreCoverage>[0]) =>
  Object.fromEntries(
    abuseStoreCoverage(env, NOW).map(({ family, store }) => [family, store])
  );

describe('abuseStoreCoverage (SR-951)', () => {
  it('reports every family uncovered when nothing is configured', () => {
    const coverage = abuseStoreCoverage({}, NOW);
    expect(coverage.map((entry) => entry.family)).toEqual([
      ...ABUSE_GUARD_FAMILIES,
    ]);
    for (const entry of coverage) {
      expect(entry.store).toBe('none');
      expect(entry.reason).toMatch(/UPSTASH_REDIS_REST_URL\/TOKEN/);
    }
  });

  it('covers every family with only the Upstash pair', () => {
    for (const store of Object.values(stores(UPSTASH)))
      expect(store).toBe('upstash');
    expect(
      Object.values(stores({ ...UPSTASH, ABUSE_GUARD_BACKEND: 'upstash' }))
    ).toEqual(ABUSE_GUARD_FAMILIES.map(() => 'upstash'));
  });

  it('treats a blank Upstash value as missing', () => {
    expect(
      Object.values(
        stores({ ...UPSTASH, UPSTASH_REDIS_REST_TOKEN: '   ' })
      ).every((store) => store === 'none')
    ).toBe(true);
  });

  it('covers assigned families with a complete guard config only', () => {
    const all = ABUSE_GUARD_FAMILIES.join(',');
    expect(
      Object.values(stores({ ...GUARD, ABUSE_GUARD_FAMILIES: all }))
    ).toEqual(ABUSE_GUARD_FAMILIES.map(() => 'durable-object'));
    // Partial assignment: unassigned families still need Upstash.
    const partial = stores({ ...GUARD, ABUSE_GUARD_FAMILIES: 'proxy' });
    expect(partial.proxy).toBe('durable-object');
    expect(partial.replay).toBe('none');
    // Weak secret, non-HTTPS origin or explicit off: assigned family is off.
    for (const env of [
      { ...GUARD, ABUSE_GUARD_SECRET: 'short', ABUSE_GUARD_FAMILIES: all },
      {
        ...GUARD,
        ABUSE_GUARD_URL: 'http://guard.example',
        ABUSE_GUARD_FAMILIES: all,
      },
      {
        ...GUARD,
        ...UPSTASH,
        ABUSE_GUARD_BACKEND: 'off',
        ABUSE_GUARD_FAMILIES: all,
      },
    ])
      expect(Object.values(stores(env)).every((s) => s === 'none')).toBe(true);
  });

  it('needs the Upstash pair for replay while a legacy cutover is active', () => {
    const env = { ...GUARD, ABUSE_GUARD_FAMILIES: 'replay' };
    expect(
      stores({
        ...env,
        ...UPSTASH,
        ABUSE_GUARD_REPLAY_LEGACY_UNTIL: '2026-12-01T00:00:00Z',
      }).replay
    ).toBe('durable-object');
    expect(
      stores({
        ...env,
        ABUSE_GUARD_REPLAY_LEGACY_UNTIL: '2026-12-01T00:00:00Z',
      }).replay
    ).toBe('none');
    expect(
      stores({
        ...env,
        ABUSE_GUARD_REPLAY_LEGACY_UNTIL: '2026-11-01T00:00:00Z',
      }).replay
    ).toBe('durable-object');
    expect(
      stores({ ...env, ...UPSTASH, ABUSE_GUARD_REPLAY_LEGACY_UNTIL: 'soon' })
        .replay
    ).toBe('none');
  });

  it('counts Sensitive (redacted) values as present, presence only', () => {
    const all = ABUSE_GUARD_FAMILIES.join(',');
    const redacted = {
      ABUSE_GUARD_URL: '[SENSITIVE]',
      ABUSE_GUARD_SECRET: '[SENSITIVE]',
      ABUSE_GUARD_KEY_PEPPER: '[SENSITIVE]',
      ABUSE_GUARD_FAMILIES: all,
    };
    // Without the redaction hint the placeholder fails the strength check.
    expect(
      abuseStoreCoverage(redacted, NOW).every((entry) => entry.store === 'none')
    ).toBe(true);
    const coverage = abuseStoreCoverage(
      redacted,
      NOW,
      new Set([
        'ABUSE_GUARD_URL',
        'ABUSE_GUARD_SECRET',
        'ABUSE_GUARD_KEY_PEPPER',
      ])
    );
    for (const entry of coverage) {
      expect(entry.store).toBe('durable-object');
      expect(entry.presenceOnly).toBe(true);
    }
    // A visible weak secret still fails even when the pepper is redacted.
    const weak = abuseStoreCoverage(
      { ...redacted, ABUSE_GUARD_SECRET: 'short' },
      NOW,
      new Set(['ABUSE_GUARD_URL', 'ABUSE_GUARD_KEY_PEPPER'])
    );
    expect(weak.every((entry) => entry.store === 'none')).toBe(true);
    // A redacted Upstash token counts as present.
    const upstash = abuseStoreCoverage(
      {
        UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.invalid',
        UPSTASH_REDIS_REST_TOKEN: '[SENSITIVE]',
      },
      NOW,
      new Set(['UPSTASH_REDIS_REST_TOKEN'])
    );
    for (const entry of upstash) {
      expect(entry.store).toBe('upstash');
      expect(entry.presenceOnly).toBe(true);
    }
  });
});
