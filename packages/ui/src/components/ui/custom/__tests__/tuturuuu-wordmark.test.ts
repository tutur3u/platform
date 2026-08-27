import { describe, expect, it } from 'vitest';
import { toProductName } from '../tuturuuu-wordmark';

describe('toProductName', () => {
  it('strips the company name from a full app name', () => {
    expect(toProductName('Tuturuuu Forms')).toBe('Forms');
    expect(toProductName('Tuturuuu Calendar')).toBe('Calendar');
  });

  it('is case-insensitive and tolerates extra spacing', () => {
    expect(toProductName('TUTURUUU  Forms')).toBe('Forms');
  });

  it('leaves a bare product name alone', () => {
    expect(toProductName('Forms')).toBe('Forms');
  });

  it('returns the name unchanged when stripping would empty it', () => {
    // Otherwise the lockup renders with a blank second line.
    expect(toProductName('Tuturuuu')).toBe('Tuturuuu');
  });
});
