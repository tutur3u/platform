import { describe, expect, it } from 'vitest';
import { optionIndexFromKey } from './use-form-keyboard';

describe('optionIndexFromKey', () => {
  it('maps 1-9 to the first nine options', () => {
    expect(optionIndexFromKey('1')).toBe(0);
    expect(optionIndexFromKey('5')).toBe(4);
    expect(optionIndexFromKey('9')).toBe(8);
  });

  it('maps a-i to the same nine, in either case', () => {
    expect(optionIndexFromKey('a')).toBe(0);
    expect(optionIndexFromKey('A')).toBe(0);
    expect(optionIndexFromKey('i')).toBe(8);
    expect(optionIndexFromKey('I')).toBe(8);
  });

  it('rejects 0, since options are labelled from 1', () => {
    expect(optionIndexFromKey('0')).toBeNull();
  });

  it('rejects letters past i rather than running off the end', () => {
    expect(optionIndexFromKey('j')).toBeNull();
    expect(optionIndexFromKey('z')).toBeNull();
  });

  it('rejects anything that is not a single character', () => {
    // Named keys arrive as multi-character strings, and treating "Enter" as
    // an option index would make every advance also pick something.
    expect(optionIndexFromKey('Enter')).toBeNull();
    expect(optionIndexFromKey('ArrowDown')).toBeNull();
    expect(optionIndexFromKey('')).toBeNull();
  });

  it('rejects punctuation and symbols', () => {
    expect(optionIndexFromKey('-')).toBeNull();
    expect(optionIndexFromKey(' ')).toBeNull();
  });
});
