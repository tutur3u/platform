import { describe, expect, it } from 'vitest';
import { generateQaPassword } from './policy';

describe('generateQaPassword', () => {
  it('always meets the Auth lowercase, uppercase, digit and symbol policy', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const password = generateQaPassword();
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[-_]/);
      expect(password).toMatch(/^[A-Za-z0-9_-]{47}$/);
      passwords.add(password);
    }
    expect(passwords.size).toBe(2000);
  });
});
