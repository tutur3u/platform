import { isIncompleteEmail } from '@/utils/email-helper';
import { describe, expect, it } from 'vitest';

describe('isIncompleteEmail', () => {
  it('should return false for empty string', () => {
    expect(isIncompleteEmail('')).toBe(false);
  });

  it('should return false for valid email', () => {
    expect(isIncompleteEmail('test@example.com')).toBe(false);
  });

  it('should return true for @ symbol at the beginning', () => {
    expect(isIncompleteEmail('@example.com')).toBe(false);
  });

  it('should return true for @ symbol in the middle', () => {
    expect(isIncompleteEmail('test@example')).toBe(true);
  });

  it('should return true for @ symbol at the end', () => {
    expect(isIncompleteEmail('test@')).toBe(true);
  });

  it('should return true for non leading @ symbol but no domain', () => {
    expect(isIncompleteEmail('test@test@')).toBe(true);
  });

  it('should return true for string ending with @', () => {
    expect(isIncompleteEmail('test@')).toBe(true);
  });
});
