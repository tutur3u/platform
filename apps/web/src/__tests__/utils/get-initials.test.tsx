import { getInitials } from '@/utils/name-helper';
import { describe, expect, it } from 'vitest';

describe('getInitials', () => {
  it('should return an empty string if the name is undefined', () => {
    const name = undefined;
    const result = getInitials(name);
    expect(result).toBe('');
  });

  it('should return the first letter of the name if the name has only one word', () => {
    const name = 'John';
    const result = getInitials(name);
    expect(result).toBe('J');
  });

  it('should return the first letter of the first name and the first letter of the last name if the name has multiple words', () => {
    const name = 'John Doe';
    const result = getInitials(name);
    expect(result).toBe('JD');
  });

  it('should return the first letter of the first name, middle name, and last name if the name has multiple parts', () => {
    const name = 'John William Doe';
    const result = getInitials(name);
    expect(result).toBe('JD');
  });

  it('should ignore spaces and special characters in the name', () => {
    const name = '  John    William   Doe  ';
    const result = getInitials(name);
    expect(result).toBe('JD');
  });

  it('should return an empty string if the name is an empty string', () => {
    const name = '';
    const result = getInitials(name);
    expect(result).toBe('');
  });
});
