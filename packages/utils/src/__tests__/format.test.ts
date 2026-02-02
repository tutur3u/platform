import { describe, expect, it } from 'vitest';
import {
  capitalize,
  formatBytes,
  formatCurrency,
  formatDuration,
  isValidBlobUrl,
  isValidHttpUrl,
} from '../format';

describe('Format Utilities', () => {
  describe('capitalize', () => {
    it('capitalizes first letter of a word', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('handles single character strings', () => {
      expect(capitalize('a')).toBe('A');
    });

    it('handles empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('handles null input', () => {
      expect(capitalize(null)).toBe('');
    });

    it('handles undefined input', () => {
      expect(capitalize(undefined)).toBe('');
    });

    it('does not change already capitalized strings', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });

    it('preserves rest of the string', () => {
      expect(capitalize('hELLO')).toBe('HELLO');
    });

    it('handles strings with spaces', () => {
      expect(capitalize('hello world')).toBe('Hello world');
    });

    it('handles numbers at the start', () => {
      expect(capitalize('123abc')).toBe('123abc');
    });
  });

  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Byte');
    });

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('formats terabytes', () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });

    it('respects decimal places option', () => {
      expect(formatBytes(1536, { decimals: 2 })).toBe('1.50 KB');
    });

    it('uses accurate sizes when specified', () => {
      expect(formatBytes(1024, { sizeType: 'accurate' })).toBe('1 KiB');
    });

    it('uses accurate sizes for MiB', () => {
      expect(formatBytes(1024 * 1024, { sizeType: 'accurate' })).toBe('1 MiB');
    });

    it('handles large numbers', () => {
      expect(formatBytes(5 * 1024 * 1024 * 1024, { decimals: 1 })).toBe(
        '5.0 GB'
      );
    });
  });

  describe('formatDuration', () => {
    it('formats seconds only', () => {
      expect(formatDuration(30)).toBe('30 seconds');
    });

    it('formats 1 second singular', () => {
      expect(formatDuration(1)).toBe('1 seconds');
    });

    it('formats minutes only', () => {
      expect(formatDuration(120)).toBe('2 minutes');
    });

    it('formats 1 minute singular', () => {
      expect(formatDuration(60)).toBe('1 minute');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1 minute 30 seconds');
    });

    it('formats hours only', () => {
      expect(formatDuration(3600)).toBe('1 hour');
    });

    it('formats multiple hours', () => {
      expect(formatDuration(7200)).toBe('2 hours');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(3720)).toBe('1 hour 2 minutes');
    });

    it('does not show seconds when hours are present', () => {
      expect(formatDuration(3661)).toBe('1 hour 1 minute');
    });

    it('formats complex duration', () => {
      expect(formatDuration(7320)).toBe('2 hours 2 minutes');
    });

    it('handles 59 seconds', () => {
      expect(formatDuration(59)).toBe('59 seconds');
    });

    it('handles exactly 60 seconds', () => {
      expect(formatDuration(60)).toBe('1 minute');
    });
  });

  describe('isValidBlobUrl', () => {
    it('returns true for valid blob URL', () => {
      expect(isValidBlobUrl('blob:http://localhost:3000/abc123')).toBe(true);
    });

    it('returns true for blob URL with uppercase', () => {
      expect(isValidBlobUrl('BLOB:http://localhost:3000/abc123')).toBe(true);
    });

    it('returns true for blob URL with leading whitespace', () => {
      expect(isValidBlobUrl('  blob:http://localhost:3000/abc123')).toBe(true);
    });

    it('returns false for http URL', () => {
      expect(isValidBlobUrl('http://example.com')).toBe(false);
    });

    it('returns false for https URL', () => {
      expect(isValidBlobUrl('https://example.com')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isValidBlobUrl(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidBlobUrl(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidBlobUrl('')).toBe(false);
    });

    it('returns false for data URL', () => {
      expect(isValidBlobUrl('data:image/png;base64,abc')).toBe(false);
    });
  });

  describe('isValidHttpUrl', () => {
    it('returns true for http URL', () => {
      expect(isValidHttpUrl('http://example.com')).toBe(true);
    });

    it('returns true for https URL', () => {
      expect(isValidHttpUrl('https://example.com')).toBe(true);
    });

    it('returns true for URL with path', () => {
      expect(isValidHttpUrl('https://example.com/path/to/resource')).toBe(true);
    });

    it('returns true for URL with query string', () => {
      expect(isValidHttpUrl('https://example.com?foo=bar')).toBe(true);
    });

    it('returns true for URL with port', () => {
      expect(isValidHttpUrl('http://localhost:3000')).toBe(true);
    });

    it('returns false for ftp URL', () => {
      expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    });

    it('returns false for file URL', () => {
      expect(isValidHttpUrl('file:///path/to/file')).toBe(false);
    });

    it('returns false for blob URL', () => {
      expect(isValidHttpUrl('blob:http://localhost:3000/abc')).toBe(false);
    });

    it('returns false for null', () => {
      expect(isValidHttpUrl(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isValidHttpUrl(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidHttpUrl('')).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(isValidHttpUrl('not-a-url')).toBe(false);
    });

    it('returns false for javascript protocol', () => {
      expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    });

    it('handles URL with whitespace', () => {
      expect(isValidHttpUrl('  https://example.com  ')).toBe(true);
    });
  });

  describe('formatCurrency', () => {
    it('formats VND currency by default', () => {
      const result = formatCurrency(1000000);
      expect(result).toContain('1.000.000');
      expect(result).toContain('₫');
    });

    it('formats negative amounts with sign', () => {
      const result = formatCurrency(-50000);
      expect(result).toContain('-');
      expect(result).toContain('50.000');
    });

    it('formats positive amounts without sign by default', () => {
      const result = formatCurrency(50000);
      expect(result).not.toContain('+');
    });

    it('formats positive amounts with sign when specified', () => {
      const result = formatCurrency(50000, 'VND', 'vi-VN', {
        signDisplay: 'always',
      });
      expect(result).toContain('+');
    });

    it('formats USD currency', () => {
      const result = formatCurrency(1000, 'USD');
      expect(result).toContain('$');
      expect(result).toContain('1,000');
    });

    it('formats EUR currency', () => {
      const result = formatCurrency(1000, 'EUR');
      expect(result).toContain('€');
    });

    it('respects custom options', () => {
      const result = formatCurrency(1000.5, 'USD', 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      expect(result).toContain('1,000.50');
    });

    it('handles zero amount', () => {
      const result = formatCurrency(0);
      expect(result).toContain('0');
    });
  });
});
