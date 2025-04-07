import { generateSalt, hashPassword } from '@tuturuuu/utils/crypto';
import { describe, expect, it } from 'vitest';

describe('crypto utilities', () => {
  describe('generateSalt', () => {
    it('should generate a unique salt each time', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toEqual(salt2);
    });

    it('should generate a salt with appropriate length', () => {
      const salt = generateSalt();
      expect(salt.length).toBeGreaterThan(16); // Adjust based on your implementation
    });
  });

  describe('hashPassword', () => {
    it('should hash a password correctly', async () => {
      const password = 'password';
      const salt = generateSalt();
      const hashedPassword = await hashPassword(password, salt);
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toEqual(password); // Verify it's actually hashed
    });

    it('should be deterministic with the same salt', async () => {
      const password = 'password';
      const salt = generateSalt();
      const hash1 = await hashPassword(password, salt);
      const hash2 = await hashPassword(password, salt);
      expect(hash1).toEqual(hash2);
    });

    it('should produce different hashes for different passwords', async () => {
      const salt = generateSalt();
      const hash1 = await hashPassword('password1', salt);
      const hash2 = await hashPassword('password2', salt);
      expect(hash1).not.toEqual(hash2);
    });

    it('should produce different hashes with different salts', async () => {
      const password = 'password';
      const hash1 = await hashPassword(password, generateSalt());
      const hash2 = await hashPassword(password, generateSalt());
      expect(hash1).not.toEqual(hash2);
    });

    it('should handle edge cases', async () => {
      const salt = generateSalt();
      // Empty password
      const emptyHash = await hashPassword('', salt);
      expect(emptyHash).toBeDefined();

      // Long password
      const longPassword = 'a'.repeat(1000);
      const longHash = await hashPassword(longPassword, salt);
      expect(longHash).toBeDefined();
    });
  });
});
