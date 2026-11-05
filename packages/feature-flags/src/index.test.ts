import { describe, expect, it } from 'vitest';
import sourceRegistry from '../../../config/feature-flags.json';
import { evaluateFlags, registry } from './index';

describe('registry', () => {
  it('matches the generated typed registry', () => {
    expect(registry).toEqual(sourceRegistry);
  });

  it('has unique snake_case keys, ownership, expiry, valid classes and false defaults', () => {
    expect(new Set(registry.map(({ key }) => key)).size).toBe(registry.length);
    for (const flag of registry) {
      expect(flag.key).toMatch(/^[a-z]+(?:_[a-z]+)*$/);
      expect(flag.description.length).toBeGreaterThan(0);
      expect(flag.owner).toBe(
        flag.key === 'tutoring_picker_tutors_only' ? 'pax' : 'mona'
      );
      expect(['read', 'write', 'ui', 'kill']).toContain(flag.class);
      expect(flag.default).toBe(false);
      expect(flag.removeBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(flag.removeBy).toISOString().slice(0, 10)).toBe(
        flag.removeBy
      );
    }
  });
});

describe('evaluateFlags', () => {
  it('returns every key with its default', () => {
    expect(evaluateFlags(registry, {})).toEqual(
      Object.fromEntries(registry.map(({ key }) => [key, false]))
    );
  });

  it('forces all offline capabilities off while the master switch is off', () => {
    const overrides = Object.fromEntries(
      registry.map(({ key }) => [key, true])
    );
    overrides.mobile_offline = false;
    const flags = evaluateFlags(registry, {}, overrides);
    for (const { key } of registry)
      expect(flags[key]).toBe(
        !key.startsWith('offline_') && key !== 'mobile_offline'
      );
  });

  it('allows registered overrides when the master switch is on', () => {
    const flags = evaluateFlags(
      registry,
      {},
      {
        mobile_offline: true,
        offline_read_notes: true,
      }
    );
    expect(flags.mobile_offline).toBe(true);
    expect(flags.offline_read_notes).toBe(true);
    expect(flags.offline_edit_finance).toBe(false);
  });

  it('ignores unknown and inherited override keys', () => {
    const overrides = Object.create({ mobile_offline: true });
    overrides.unknown_flag = true;
    expect(evaluateFlags(registry, {}, overrides)).toEqual(
      evaluateFlags(registry, {})
    );
  });

  it('is deterministic across contexts and override insertion order', () => {
    const before = JSON.stringify(registry);
    expect(
      evaluateFlags(
        registry,
        { userId: 'one' },
        { mobile_offline: true, offline_read_notes: true }
      )
    ).toEqual(
      evaluateFlags(
        registry,
        { wsId: 'two' },
        { offline_read_notes: true, mobile_offline: true }
      )
    );
    expect(JSON.stringify(registry)).toBe(before);
  });
});
