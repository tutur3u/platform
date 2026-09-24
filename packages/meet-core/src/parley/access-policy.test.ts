import { describe, expect, it } from 'vitest';
import { hasInternalParleyDomain, normalizeParleyEmail } from './access-policy';

describe('Parley email gate', () => {
  it('normalizes exact domains without admitting suffix lookalikes', () => {
    expect(
      hasInternalParleyDomain(normalizeParleyEmail(' USER@TUTURUUU.COM ')!)
    ).toBe(true);
    for (const email of [
      'user@sub.tuturuuu.com',
      'user@tuturuuu.com.example',
      'user@evil-tuturuuu.com',
    ])
      expect(hasInternalParleyDomain(email)).toBe(false);
    expect(normalizeParleyEmail('a@b@tuturuuu.com')).toBe(null);
    expect(normalizeParleyEmail(null)).toBe(null);
  });
});
