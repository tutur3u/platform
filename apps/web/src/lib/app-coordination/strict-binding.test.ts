import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_APP_STRICT_BINDING_ENV,
  isExternalAppStrictBinding,
  STRICT_BINDING_EXEMPT_APP_IDS,
  STRICT_BINDING_EXEMPTION_EXPIRES_AT,
} from './strict-binding';

const beforeExpiry = new Date('2026-11-25T23:58:59+07:00');
const atExpiry = new Date('2026-11-25T23:59:00+07:00');

afterEach(() => vi.unstubAllEnvs());

describe('isExternalAppStrictBinding', () => {
  it('pins RA-MEDIA-C1-001 to cybershield35 and its expiry', () => {
    expect(STRICT_BINDING_EXEMPT_APP_IDS).toEqual(['cybershield35']);
    expect(STRICT_BINDING_EXEMPTION_EXPIRES_AT.toISOString()).toBe(
      '2026-11-25T16:59:00.000Z'
    );
  });

  it('exempts cybershield35 only before the expiry', () => {
    expect(isExternalAppStrictBinding('cybershield35', beforeExpiry)).toBe(
      false
    );
    expect(isExternalAppStrictBinding('CyberShield35', beforeExpiry)).toBe(
      false
    );
    expect(isExternalAppStrictBinding('cybershield35', atExpiry)).toBe(true);
    expect(
      isExternalAppStrictBinding('cybershield35', new Date('2027-01-01'))
    ).toBe(true);
  });

  it('is always strict for any other app', () => {
    for (const now of [new Date('2026-01-01'), beforeExpiry, atExpiry]) {
      expect(isExternalAppStrictBinding('fysh', now)).toBe(true);
    }
  });

  it('lets the env flag add strictness only', () => {
    for (const value of ['off', '0', 'false', 'no', '']) {
      vi.stubEnv(EXTERNAL_APP_STRICT_BINDING_ENV, value);
      expect(isExternalAppStrictBinding('fysh', beforeExpiry)).toBe(true);
      expect(isExternalAppStrictBinding('cybershield35', beforeExpiry)).toBe(
        false
      );
    }
    for (const value of ['all', '1', 'true', 'ON']) {
      vi.stubEnv(EXTERNAL_APP_STRICT_BINDING_ENV, value);
      expect(isExternalAppStrictBinding('cybershield35', beforeExpiry)).toBe(
        true
      );
    }
  });
});
