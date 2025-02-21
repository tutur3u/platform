import { getInitials } from '@/utils/name-helper';
import { describe, expect, it } from 'vitest';

describe('getInitials', () => {
  it('should return an empty string if the name is undefined', () => {
    expect(getInitials(undefined)).toBe('');
  });

  it('should return the first letter of the name if the name has only one word', () => {
    expect(getInitials('John')).toBe('J');
  });

  it('should return first and last initials for two-word names', () => {
    expect(getInitials('John Doe')).toBe('JD');
  });

  it('should handle names with accented characters', () => {
    expect(getInitials('José García')).toBe('JG');
    expect(getInitials('Đặng Văn A')).toBe('ĐA');
  });

  it('should handle names with lowercase characters', () => {
    expect(getInitials('john doe')).toBe('JD');
    expect(getInitials('jane mary smith')).toBe('JS');
  });

  it('should handle names with extra spaces', () => {
    expect(getInitials('  John    William   Doe  ')).toBe('JD');
    expect(getInitials('\tJohn\nDoe ')).toBe('JD');
  });

  it('should handle empty string', () => {
    expect(getInitials('')).toBe('');
  });

  it('should handle names with special characters', () => {
    expect(getInitials("O'Connor-Smith")).toBe('OS');
    expect(getInitials('Van der Waals')).toBe('VW');
  });

  it('should handle single character names', () => {
    expect(getInitials('J')).toBe('J');
    expect(getInitials('J.')).toBe('J');
  });

  it('should handle null input', () => {
    expect(getInitials(null)).toBe('');
  });

  it('should limit to maximum two characters', () => {
    expect(getInitials('John William Doe')).toBe('JD');
    expect(getInitials('Anna Maria Sofia Russo')).toBe('AR');
  });
});
