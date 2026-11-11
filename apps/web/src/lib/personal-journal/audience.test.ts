import { describe, expect, it } from 'vitest';
import { isTuturuuuExperimentalAccount } from './audience';

describe('experimental journal audience', () => {
  it('accepts only a tuturuuu.com account', () => {
    expect(isTuturuuuExperimentalAccount('person@tuturuuu.com')).toBe(true);
    expect(isTuturuuuExperimentalAccount(' Person@Tuturuuu.com ')).toBe(true);
    expect(isTuturuuuExperimentalAccount('a+b@tuturuuu.com')).toBe(true);
  });

  it('rejects other domains, subdomains, and empty values', () => {
    for (const email of [
      null,
      undefined,
      '',
      'person@example.com',
      'person@nottuturuuu.com',
      'person@tuturuuu.com.evil',
      'person@sub.tuturuuu.com',
      'person@tuturuuu.com person@tuturuuu.com',
      'tuturuuu.com',
    ]) {
      expect(isTuturuuuExperimentalAccount(email)).toBe(false);
    }
  });
});
