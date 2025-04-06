import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';
import { describe, expect, it } from 'vitest';

describe('hashPassword', () => {
  it('should hash a password correctly', async () => {
    const password = 'password';
    const salt = generateSalt();
    const hashedPassword = await hashPassword(password, salt);
    expect(hashedPassword).toBeDefined();
  });
});
