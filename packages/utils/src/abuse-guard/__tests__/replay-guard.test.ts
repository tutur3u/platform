// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isKnownReplay,
  preLimitReplayAttempt,
  REPLAY_PRE_LIMITS,
  rememberReplay,
} from '../replay-guard';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('replay guard', () => {
  it('stays inert while the replay family is unassigned', () => {
    rememberReplay('k-inert', Date.now() / 1000 + 60);
    expect(isKnownReplay('k-inert')).toBe(false);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(preLimitReplayAttempt('p-inert', '192.0.2.1')).toBeNull();
    }
  });

  it('remembers replayed keys until their token expires', () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    const now = 1_000_000;
    rememberReplay('k1', now / 1000 + 30);
    expect(isKnownReplay('k1', now)).toBe(true);
    expect(isKnownReplay('k1', now + 30_000)).toBe(false);
    expect(isKnownReplay('other', now)).toBe(false);
  });

  it('pre-limits a principal and an IP per instance', () => {
    vi.stubEnv('ABUSE_GUARD_FAMILIES', 'replay');
    const now = 120_000;
    for (
      let index = 0;
      index < REPLAY_PRE_LIMITS.principalPerMinute;
      index += 1
    ) {
      expect(preLimitReplayAttempt('p1', null, now)).toBeNull();
    }
    expect(preLimitReplayAttempt('p1', null, now)).toBe(60);
    for (let index = 0; index < REPLAY_PRE_LIMITS.ipPerMinute; index += 1) {
      expect(
        preLimitReplayAttempt(`p-ip-${index}`, '198.51.100.9', now)
      ).toBeNull();
    }
    expect(preLimitReplayAttempt('p-new', '198.51.100.9', now)).toBe(60);
  });
});
