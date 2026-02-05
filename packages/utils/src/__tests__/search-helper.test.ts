import { describe, expect, it } from 'vitest';
import { escapeLikePattern, sanitizeSearchQuery } from '../search-helper';

describe('search-helper', () => {
  describe('sanitizeSearchQuery', () => {
    it('should return null for null, undefined, or empty strings', () => {
      expect(sanitizeSearchQuery(null)).toBeNull();
      expect(sanitizeSearchQuery(undefined)).toBeNull();
      expect(sanitizeSearchQuery('')).toBeNull();
      expect(sanitizeSearchQuery('   ')).toBeNull();
    });

    it('should trim whitespace', () => {
      expect(sanitizeSearchQuery('  hello  ')).toBe('hello');
    });

    it('should remove control characters', () => {
      // \x00 is a control character (NULL)
      // \x1F is a control character (INFORMATION SEPARATOR ONE)
      // \x7F is a control character (DELETE)
      const input = 'hello\x00world\x1F!\x7F';
      expect(sanitizeSearchQuery(input)).toBe('helloworld!');
    });

    it('should return null if the string only contains control characters and whitespace', () => {
      expect(sanitizeSearchQuery(' \x00 \x1F ')).toBeNull();
    });
  });

  describe('escapeLikePattern', () => {
    it('should escape backslashes', () => {
      expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    });

    it('should escape percent signs', () => {
      expect(escapeLikePattern('a%b')).toBe('a\\%b');
    });

    it('should escape underscores', () => {
      expect(escapeLikePattern('a_b')).toBe('a\\_b');
    });

    it('should escape multiple special characters', () => {
      expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    });

    it('should leave normal characters unchanged', () => {
      expect(escapeLikePattern('hello world 123')).toBe('hello world 123');
    });
  });
});
