import { beforeEach, describe, expect, it } from 'vitest';
import {
  AUTO_TIMEZONE,
  getBrowserTimezone,
  getTimezoneOffset,
  isValidTimezone,
  resolveAutoTimezone,
} from '../timezone';

describe('timezone utilities', () => {
  describe('isValidTimezone', () => {
    it('should return true for valid IANA timezone identifiers', () => {
      // Test commonly supported timezones
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      // Note: Some test environments may not support all IANA timezones
      // through the Intl.DateTimeFormat fallback
    });

    it('should return false for invalid timezone strings', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
      expect(isValidTimezone('random-string')).toBe(false);
      // Note: PST/EST may be accepted by some Node.js versions as legacy abbreviations
      // but they're not proper IANA identifiers - behavior may vary by environment
    });

    it('should return false for null, undefined, or non-string values', () => {
      expect(isValidTimezone(null as unknown as string)).toBe(false);
      expect(isValidTimezone(undefined as unknown as string)).toBe(false);
      expect(isValidTimezone(123 as unknown as string)).toBe(false);
    });
  });

  describe('getBrowserTimezone', () => {
    it('should return a valid timezone string', () => {
      const tz = getBrowserTimezone();
      expect(typeof tz).toBe('string');
      expect(tz.length).toBeGreaterThan(0);
      // Should be a valid timezone
      expect(isValidTimezone(tz)).toBe(true);
    });

    it('should fallback to UTC when Intl is unavailable', () => {
      const originalIntl = globalThis.Intl;
      // @ts-expect-error - Intentionally removing Intl for testing
      globalThis.Intl = undefined;

      const tz = getBrowserTimezone();
      expect(tz).toBe('UTC');

      globalThis.Intl = originalIntl;
    });
  });

  describe('resolveAutoTimezone', () => {
    let mockBrowserTimezone: string;

    beforeEach(() => {
      // Store the actual browser timezone
      mockBrowserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    });

    it('should resolve "auto" to browser timezone', () => {
      const result = resolveAutoTimezone('auto');
      expect(result).toBe(mockBrowserTimezone);
    });

    it('should resolve AUTO_TIMEZONE constant to browser timezone', () => {
      const result = resolveAutoTimezone(AUTO_TIMEZONE);
      expect(result).toBe(mockBrowserTimezone);
    });

    it('should return valid timezone as-is', () => {
      expect(resolveAutoTimezone('America/New_York')).toBe('America/New_York');
      expect(resolveAutoTimezone('UTC')).toBe('UTC');
      expect(resolveAutoTimezone('Europe/London')).toBe('Europe/London');
    });

    it('should fallback to UTC for invalid timezone', () => {
      expect(resolveAutoTimezone('Invalid/Timezone')).toBe('UTC');
      expect(resolveAutoTimezone('random-string')).toBe('UTC');
    });

    it('should fallback to UTC for null or undefined', () => {
      expect(resolveAutoTimezone(null)).toBe('UTC');
      expect(resolveAutoTimezone(undefined)).toBe('UTC');
    });
  });

  describe('getTimezoneOffset', () => {
    it('should return correct offset for known timezones', () => {
      // Note: These tests may fail during DST transitions
      // We test format rather than exact values since offsets change with DST
      const utcOffset = getTimezoneOffset('UTC');
      expect(utcOffset).toBe('+00:00');

      const hoChiMinhOffset = getTimezoneOffset('Asia/Ho_Chi_Minh');
      expect(hoChiMinhOffset).toBe('+07:00');

      const tokyoOffset = getTimezoneOffset('Asia/Tokyo');
      expect(tokyoOffset).toBe('+09:00');
    });

    it('should return offset in correct format', () => {
      const offset = getTimezoneOffset('America/New_York');
      // Should match format +HH:MM or -HH:MM
      expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    });

    it('should fallback to +00:00 for invalid timezone', () => {
      const offset = getTimezoneOffset('Invalid/Timezone');
      expect(offset).toBe('+00:00');
    });
  });
});
