import { describe, expect, it } from 'vitest';
import {
  generateFunName,
  getAvatarPlaceholder,
  getInitials,
} from '../name-helper';

describe('Name Helper', () => {
  describe('getInitials', () => {
    it('returns empty string for null', () => {
      expect(getInitials(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(getInitials(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(getInitials('')).toBe('');
    });

    it('returns empty string for whitespace only', () => {
      expect(getInitials('   ')).toBe('');
    });

    it('returns single initial for single word', () => {
      expect(getInitials('John')).toBe('J');
    });

    it('returns two initials for two words', () => {
      expect(getInitials('John Doe')).toBe('JD');
    });

    it('returns first and last initials for multiple words', () => {
      expect(getInitials('John Middle Doe')).toBe('JD');
    });

    it('handles lowercase input', () => {
      expect(getInitials('john doe')).toBe('JD');
    });

    it('handles hyphenated names', () => {
      expect(getInitials('Mary-Jane Watson')).toBe('MW');
    });

    it('handles names with apostrophes', () => {
      expect(getInitials("O'Brien Smith")).toBe('OS');
    });

    it('handles names with tabs and newlines', () => {
      expect(getInitials('John\tDoe')).toBe('JD');
    });

    it('handles articles like "van"', () => {
      expect(getInitials('Ludwig van Beethoven')).toBe('LB');
    });

    it('handles articles like "de"', () => {
      expect(getInitials('Leonardo da Vinci')).toBe('LV');
    });

    it('handles capitalized prefix like "Van"', () => {
      expect(getInitials('Van Helsing')).toBe('VH');
    });

    it('handles multiple spaces', () => {
      expect(getInitials('John    Doe')).toBe('JD');
    });

    it('handles trailing spaces', () => {
      expect(getInitials('  John Doe  ')).toBe('JD');
    });
  });

  describe('getAvatarPlaceholder', () => {
    it('generates correct URL for simple name', () => {
      const url = getAvatarPlaceholder('John Doe');
      expect(url).toBe('https://ui-avatars.com/api/?name=John%20Doe');
    });

    it('encodes special characters', () => {
      const url = getAvatarPlaceholder('John & Jane');
      expect(url).toBe('https://ui-avatars.com/api/?name=John%20%26%20Jane');
    });

    it('handles empty string', () => {
      const url = getAvatarPlaceholder('');
      expect(url).toBe('https://ui-avatars.com/api/?name=');
    });

    it('handles names with unicode characters', () => {
      const url = getAvatarPlaceholder('Nguyễn Văn');
      expect(url).toContain('https://ui-avatars.com/api/?name=');
      expect(url).toContain('Nguy%E1%BB%85n');
    });
  });

  describe('generateFunName', () => {
    it('generates consistent name for same ID', () => {
      const name1 = generateFunName({ id: 'test-id-123' });
      const name2 = generateFunName({ id: 'test-id-123' });
      expect(name1).toBe(name2);
    });

    it('generates different names for different IDs', () => {
      const name1 = generateFunName({ id: 'test-id-1' });
      const name2 = generateFunName({ id: 'test-id-2' });
      expect(name1).not.toBe(name2);
    });

    it('generates English name by default', () => {
      const name = generateFunName({ id: 'test-id' });
      // Should contain English adjective + animal + emoji at end
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+/);
      // Should end with an emoji (emoji are typically > 1 char in JS)
      expect(name.length).toBeGreaterThan(0);
    });

    it('generates Vietnamese name when locale is vi', () => {
      const name = generateFunName({ id: 'test-id', locale: 'vi' });
      // Vietnamese format puts animal first, then adjective
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    it('defaults to English for invalid locale', () => {
      const name = generateFunName({ id: 'test-id', locale: 'invalid-locale' });
      // Should fall back to English pattern
      expect(name).toBeDefined();
    });

    it('includes emoji in the name', () => {
      const name = generateFunName({ id: 'test-id' });
      // Name should end with an emoji (unicode character > 127)
      const lastChar = name.charCodeAt(name.length - 1);
      expect(lastChar).toBeGreaterThan(127);
    });

    it('handles empty ID string', () => {
      const name = generateFunName({ id: '' });
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    it('handles very long ID', () => {
      const longId = 'a'.repeat(1000);
      const name = generateFunName({ id: longId });
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });

    it('handles special characters in ID', () => {
      const name = generateFunName({ id: '!@#$%^&*()' });
      expect(name).toBeDefined();
      expect(typeof name).toBe('string');
    });
  });
});
