import { describe, expect, it } from 'vitest';
import { isIncompleteEmail } from '@/utils/email-helper';

describe('isIncompleteEmail', () => {
  it('should return false for empty string', () => {
    expect(isIncompleteEmail('')).toBe(false);
  });

  it('should return false for valid email', () => {
    expect(isIncompleteEmail('test@example.com')).toBe(false);
  });

  it('should return false for @ symbol at the beginning', () => {
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

  it('should handle special characters before @', () => {
    expect(isIncompleteEmail('test.name@')).toBe(true);
    expect(isIncompleteEmail('test+name@')).toBe(true);
    expect(isIncompleteEmail('test-name@')).toBe(true);
  });

  it('should handle multiple @ symbols correctly', () => {
    expect(isIncompleteEmail('test@@')).toBe(true);
    expect(isIncompleteEmail('test@domain@')).toBe(true);
    expect(isIncompleteEmail('test@domain@domain.com')).toBe(false);
  });

  it('should handle whitespace correctly', () => {
    expect(isIncompleteEmail('test @ ')).toBe(false);
    expect(isIncompleteEmail('test@  ')).toBe(true);
    expect(isIncompleteEmail('  test@')).toBe(true);
  });

  it('should return false for strings without @', () => {
    expect(isIncompleteEmail('testexample')).toBe(false);
    expect(isIncompleteEmail('test.example')).toBe(false);
  });

  it('should handle null and undefined', () => {
    expect(isIncompleteEmail(null as unknown as string)).toBe(false);
    expect(isIncompleteEmail(undefined as unknown as string)).toBe(false);
  });
});
