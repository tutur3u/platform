import { describe, expect, it } from 'vitest';
import { isEmail } from '@/utils/email-helper';

describe('isEmail', () => {
  it('should return true for valid email addresses', () => {
    expect(isEmail('john.doe@example.com')).toBe(true);
    expect(isEmail('john@example.co.uk')).toBe(true);
    expect(isEmail('john.doe+test@example.com')).toBe(true);
    expect(isEmail('j@example.com')).toBe(true);
    expect(isEmail('j@example.co.uk')).toBe(true);
    expect(isEmail('j+test@example.com')).toBe(true);
  });

  it('should return false for invalid email addresses', () => {
    expect(isEmail('john.doe@')).toBe(false);
    expect(isEmail('john.doe@example')).toBe(false);
    expect(isEmail('john.doe@example.com@example.com')).toBe(false);
    expect(isEmail('@example.com')).toBe(false);
    expect(isEmail('@')).toBe(false);
    expect(isEmail('test@example.com@example.com')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(isEmail('JOHN.DOE@EXAMPLE.COM')).toBe(true);
  });

  it('should handle special characters in local part', () => {
    expect(isEmail('john.doe+test@example.com')).toBe(true);
    expect(isEmail('john.doe-test@example.com')).toBe(true);
    expect(isEmail('john.doe_test@example.com')).toBe(true);
    expect(isEmail('john.doe@example.com.')).toBe(false);
    expect(isEmail('john.doe@example.com!')).toBe(false);
    expect(isEmail('john.doe@example.com#')).toBe(false);
  });

  it('should handle special characters in domain part', () => {
    expect(isEmail('john.doe@example.co.uk')).toBe(true);
    expect(isEmail('john.doe@example-test.com')).toBe(true);
    expect(isEmail('john.doe@example_test.com')).toBe(false);
    expect(isEmail('john.doe@example.com-test')).toBe(false);
    expect(isEmail('john.doe@example.com_test')).toBe(false);
  });

  it('should handle long email addresses', () => {
    expect(isEmail('johndoe@example.com')).toBe(true);
    expect(isEmail('johndoe+test@example.com')).toBe(true);
  });

  it('should handle email addresses with multiple periods in the local part', () => {
    expect(isEmail('john.doe.smith@example.com')).toBe(true);
    expect(isEmail('john.doe.smith+test@example.com')).toBe(true);
  });

  it('should handle email addresses with multiple periods in the domain part', () => {
    expect(isEmail('john.doe@example.co.uk')).toBe(true);
    expect(isEmail('john.doe@example.com.co.uk')).toBe(true);
  });

  it('should handle email addresses with mixed case', () => {
    expect(isEmail('JOHN.DOE@EXAMPLE.COM')).toBe(true);
    expect(isEmail('john.DOE@EXAMPLE.com')).toBe(true);
    expect(isEmail('john.Doe@example.COM')).toBe(true);
  });

  it('should handle email addresses with quoted local part', () => {
    expect(isEmail('"john.doe"@example.com')).toBe(true);
    expect(isEmail('"john.doe+test"@example.com')).toBe(true);
  });

  it('should handle email addresses with comments', () => {
    expect(isEmail('john.doe@example.com (comment)')).toBe(false);
    expect(isEmail('john.doe+test@example.com (comment)')).toBe(false);
  });
});
