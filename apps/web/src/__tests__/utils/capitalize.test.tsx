import { capitalize } from '@tutur3u/utils/format';
import { describe, expect, it } from 'vitest';

describe('capitalize', () => {
  it('should return empty string for empty input', () => {
    const input = '';
    const result = capitalize(input);
    expect(result).toBe('');
  });

  it('should return single character uppercase for single character input', () => {
    const input = 'a';
    const result = capitalize(input);
    expect(result).toBe('A');
  });

  it('should capitalize the first character and leave the rest lowercase for multi-character input', () => {
    const input = 'hello world';
    const result = capitalize(input);
    expect(result).toBe('Hello world');
  });

  it('should handle special characters and numbers', () => {
    const input = '123!@#Abc';
    const result = capitalize(input);
    expect(result).toBe('123!@#Abc');
  });

  it('should handle edge cases like whitespace and null', () => {
    const input1 = '   ';
    const result1 = capitalize(input1);
    const input2 = null;
    const result2 = capitalize(input2);
    expect(result1).toBe('   ');
    expect(result2).toBe('');
  });
});
