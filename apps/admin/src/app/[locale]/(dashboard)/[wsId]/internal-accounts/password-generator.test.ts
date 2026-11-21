import { describe, expect, it } from 'vitest';
import { generateSecureTemporaryPassword } from './password-generator';

describe('generateSecureTemporaryPassword', () => {
  it('generates a strong temporary password with every required character class', () => {
    const password = generateSecureTemporaryPassword();

    expect(password).toHaveLength(20);
    expect(password).toMatch(/[a-z]/u);
    expect(password).toMatch(/[A-Z]/u);
    expect(password).toMatch(/[0-9]/u);
    expect(password).toMatch(/[!@#$%&*+\-=?]/u);
  });

  it('rejects lengths below the account security minimum', () => {
    expect(() => generateSecureTemporaryPassword(11)).toThrow(
      'at least 12 characters'
    );
  });
});
