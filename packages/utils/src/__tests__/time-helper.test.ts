import { describe, expect, it } from 'vitest';
import { parseTimeFromTimetz } from '../time-helper';

describe('Time Helper', () => {
  describe('parseTimeFromTimetz', () => {
    it('parses valid timetz format', () => {
      expect(parseTimeFromTimetz('09:00:00+00')).toBe(9);
    });

    it('parses midnight as 24', () => {
      expect(parseTimeFromTimetz('00:00:00+00')).toBe(24);
    });

    it('parses single digit hour', () => {
      expect(parseTimeFromTimetz('5:00:00+00')).toBe(5);
    });

    it('parses hour 23', () => {
      expect(parseTimeFromTimetz('23:00:00+00')).toBe(23);
    });

    it('parses hour 12', () => {
      expect(parseTimeFromTimetz('12:00:00+00')).toBe(12);
    });

    it('parses hour 1', () => {
      expect(parseTimeFromTimetz('01:00:00+00')).toBe(1);
    });

    it('handles different timezone offsets', () => {
      expect(parseTimeFromTimetz('15:30:00+05:30')).toBe(15);
    });

    it('handles negative timezone offset', () => {
      expect(parseTimeFromTimetz('08:00:00-08')).toBe(8);
    });

    it('returns undefined for undefined input', () => {
      expect(parseTimeFromTimetz(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(parseTimeFromTimetz('')).toBeUndefined();
    });

    it('returns undefined for invalid format without colon', () => {
      expect(parseTimeFromTimetz('invalid')).toBeUndefined();
    });

    it('returns undefined for invalid hour (24)', () => {
      expect(parseTimeFromTimetz('24:00:00+00')).toBeUndefined();
    });

    it('returns undefined for negative hour', () => {
      expect(parseTimeFromTimetz('-1:00:00+00')).toBeUndefined();
    });

    it('returns undefined for non-numeric hour', () => {
      expect(parseTimeFromTimetz('abc:00:00+00')).toBeUndefined();
    });

    it('handles time without timezone', () => {
      expect(parseTimeFromTimetz('14:30:00')).toBe(14);
    });

    it('handles just hour:minute format', () => {
      expect(parseTimeFromTimetz('10:30')).toBe(10);
    });
  });
});
