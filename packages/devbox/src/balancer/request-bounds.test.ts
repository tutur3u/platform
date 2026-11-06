import { describe, expect, it, vi } from 'vitest';
import { BalancerRequestError, cleanRelativeDirectory } from './request';

describe('balancer cwd normalization', () => {
  it('rejects oversized uncontrolled input before normalization', () => {
    const input = `a${'/'.repeat(100_000)}b`;
    const original = String.prototype.replace;
    const replace = vi
      .spyOn(String.prototype, 'replace')
      .mockImplementation(function (
        this: string,
        ...args: Parameters<typeof String.prototype.replace>
      ) {
        if (String(this) === input)
          throw new Error('Normalization ran before the input bound');
        return Reflect.apply(original, this, args);
      });
    let error: unknown;
    try {
      cleanRelativeDirectory(input);
    } catch (cause) {
      error = cause;
    } finally {
      replace.mockRestore();
    }
    expect(error).toBeInstanceOf(BalancerRequestError);
    expect(String(error)).toMatch(/513/u);
  });

  it.each([
    ['', ''],
    ['.', ''],
    ['/', ''],
    ['////', ''],
    ['a/', 'a'],
    ['a///', 'a'],
    ['a/b///', 'a/b'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(cleanRelativeDirectory(input)).toBe(expected);
  });

  it('preserves the 512-character normalized limit and one trailing slash', () => {
    const directory = 'a'.repeat(512);
    expect(cleanRelativeDirectory(directory)).toBe(directory);
    expect(cleanRelativeDirectory(`${directory}/`)).toBe(directory);
    expect(() => cleanRelativeDirectory('a'.repeat(513))).toThrow(
      BalancerRequestError
    );
    expect(() => cleanRelativeDirectory('a'.repeat(514))).toThrow(
      BalancerRequestError
    );
  });
});
