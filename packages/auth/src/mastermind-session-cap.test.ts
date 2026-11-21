import { describe, expect, it } from 'vitest';
import {
  createAppSessionTokenPair,
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from './app-session-core';
import {
  parseAppCoordinationSessionPolicy,
  resolveInternalAppSessionPolicy,
} from './app-session-policy';

const secret = 'isolated-mastermind-session-cap-test-secret';
const now = new Date('2026-11-21T00:00:00Z');
const seconds = Math.floor(now.getTime() / 1000);
const loose = parseAppCoordinationSessionPolicy({
  internalAppAccessTtlSeconds: 86_400,
  internalAppOverrides: {
    mastermind: {
      internalAppAccessTtlSeconds: 3_600,
      internalAppRefreshEarlySeconds: 900,
      internalAppRefreshTtlSeconds: 7_776_000,
    },
  },
});

describe('Mastermind session caps', () => {
  it('no runtime policy raises a Mastermind session above 300 s or a day of refresh', () => {
    expect(resolveInternalAppSessionPolicy(loose, ' Mastermind ')).toEqual({
      internalAppAccessTtlSeconds: 300,
      internalAppRefreshEarlySeconds: 60,
      internalAppRefreshTtlSeconds: 86_400,
    });
    expect(
      resolveInternalAppSessionPolicy(loose, 'calendar')
        .internalAppAccessTtlSeconds
    ).toBe(86_400);
  });

  it('caps the minted pair even when a caller skips the resolver', () => {
    const pair = createAppSessionTokenPair(
      { targetApp: 'Mastermind', userId: 'owner', email: 'o@example.test' },
      {
        secret,
        now,
        policy: {
          internalAppAccessTtlSeconds: 28_800,
          internalAppRefreshTtlSeconds: 7_776_000,
        },
      }
    );
    const access = verifyAppSessionToken(pair.access.token, {
      secret,
      now,
      targetApp: 'Mastermind',
    });
    expect(access.ok && access.claims.exp - access.claims.iat).toBe(300);
    const refresh = verifyAppSessionRefreshToken(pair.refresh.token, {
      secret,
      now,
      targetApp: 'Mastermind',
    });
    expect(refresh.ok && refresh.claims.exp - seconds).toBe(86_400);
    expect(pair.refreshEarlySeconds).toBe(60);
  });

  it('binds the session to its target and enforces expiry', () => {
    const { access } = createAppSessionTokenPair(
      { targetApp: 'mastermind', userId: 'owner' },
      { secret, now }
    );
    expect(
      verifyAppSessionToken(access.token, {
        secret,
        now,
        targetApp: 'calendar',
      }).ok
    ).toBe(false);
    expect(
      verifyAppSessionToken(access.token, {
        secret,
        now: new Date(now.getTime() + 301_000),
        targetApp: 'mastermind',
      }).ok
    ).toBe(false);
    const other = createAppSessionTokenPair(
      { targetApp: 'calendar', userId: 'owner' },
      { secret, now }
    );
    expect(
      verifyAppSessionToken(other.access.token, {
        secret,
        now,
        targetApp: 'mastermind',
      }).ok
    ).toBe(false);
  });
});
