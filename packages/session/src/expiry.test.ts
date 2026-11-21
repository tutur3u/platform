import { describe, expect, it } from 'vitest';
import {
  assertionExpiry,
  BROWSER_EXPIRY,
  initialClocks,
  sessionDeadline,
  sessionState,
  touchedIdleExpiry,
} from './expiry';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

describe('expiry policy', () => {
  it('expires exactly at each deadline, with no tolerance', () => {
    const clocks = { idleExpiresAt: NOW + 10, absoluteExpiresAt: NOW + 20 };
    expect(sessionState(clocks, NOW + 9)).toBe('active');
    expect(sessionState(clocks, NOW + 10)).toBe('idle_expired');
    expect(sessionState({ ...clocks, idleExpiresAt: NOW + 30 }, NOW + 20)).toBe(
      'absolute_expired'
    );
    expect(sessionState({ ...clocks, parentDeadline: NOW + 5 }, NOW + 5)).toBe(
      'parent_expired'
    );
    expect(sessionState({ ...clocks, revokedAt: NOW }, NOW)).toBe('revoked');
  });

  it('caps a child session by its parent and the idle clock by the absolute clock', () => {
    const child = initialClocks(BROWSER_EXPIRY, NOW, NOW + DAY);
    expect(child.absoluteExpiresAt).toBe(NOW + DAY);
    expect(child.idleExpiresAt).toBe(NOW + DAY);
    expect(sessionDeadline(child)).toBe(NOW + DAY);
    const browser = initialClocks(BROWSER_EXPIRY, NOW);
    expect(touchedIdleExpiry(BROWSER_EXPIRY, browser, NOW + 29 * DAY)).toBe(
      browser.absoluteExpiresAt
    );
  });

  it('caps assertion expiry by lifetime, session deadline and grace deadline', () => {
    const iat = NOW / 1000;
    const clocks = { idleExpiresAt: NOW + DAY, absoluteExpiresAt: NOW + DAY };
    expect(assertionExpiry({ issuedAtSeconds: iat, clocks })).toBe(iat + 60);
    expect(
      assertionExpiry({
        issuedAtSeconds: iat,
        clocks: { ...clocks, idleExpiresAt: NOW + 12_500 },
      })
    ).toBe(iat + 12);
    expect(
      assertionExpiry({
        issuedAtSeconds: iat,
        clocks,
        graceDeadlineMs: NOW + 30_000,
      })
    ).toBe(iat + 30);
    expect(
      assertionExpiry({
        issuedAtSeconds: iat,
        clocks,
        graceDeadlineMs: NOW + 999,
      })
    ).toBeNull();
    expect(
      assertionExpiry({
        issuedAtSeconds: iat,
        clocks: { ...clocks, absoluteExpiresAt: NOW },
      })
    ).toBeNull();
  });
});
