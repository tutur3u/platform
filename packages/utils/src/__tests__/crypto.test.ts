import { describe, expect, it } from 'vitest';
import { generateSalt, hashPassword } from '../crypto';

describe('Crypto Utilities', () => {
  describe('generateSalt', () => {
    it('generates a salt string', () => {
      const salt = generateSalt();
      expect(typeof salt).toBe('string');
    });

    it('generates salt with correct length (20 hex chars from 10 bytes)', () => {
      const salt = generateSalt();
      expect(salt.length).toBe(20);
    });

    it('generates hexadecimal string', () => {
      const salt = generateSalt();
      expect(salt).toMatch(/^[0-9a-f]+$/);
    });

    it('generates different salts on each call', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);
    });

    it('generates unique salts across many calls', () => {
      const salts = new Set<string>();
      for (let i = 0; i < 100; i++) {
        salts.add(generateSalt());
      }
      expect(salts.size).toBe(100);
    });
  });

  describe('hashPassword', () => {
    it('hashes password with salt', async () => {
      const password = 'testPassword123';
      const salt = 'testSalt';
      const hash = await hashPassword(password, salt);
      expect(typeof hash).toBe('string');
    });

    it('generates consistent hash for same password and salt', async () => {
      const password = 'myPassword';
      const salt = 'mySalt';
      const hash1 = await hashPassword(password, salt);
      const hash2 = await hashPassword(password, salt);
      expect(hash1).toBe(hash2);
    });

    it('generates different hash for different passwords', async () => {
      const salt = 'sameSalt';
      const hash1 = await hashPassword('password1', salt);
      const hash2 = await hashPassword('password2', salt);
      expect(hash1).not.toBe(hash2);
    });

    it('generates different hash for different salts', async () => {
      const password = 'samePassword';
      const hash1 = await hashPassword(password, 'salt1');
      const hash2 = await hashPassword(password, 'salt2');
      expect(hash1).not.toBe(hash2);
    });

    it('generates 64 character hex string (SHA-256)', async () => {
      const hash = await hashPassword('test', 'salt');
      expect(hash.length).toBe(64);
    });

    it('generates hexadecimal string', async () => {
      const hash = await hashPassword('test', 'salt');
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('handles empty password', async () => {
      const hash = await hashPassword('', 'salt');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('handles empty salt', async () => {
      const hash = await hashPassword('password', '');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('handles special characters in password', async () => {
      const hash = await hashPassword('p@$$w0rd!#$%', 'salt');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('handles unicode characters in password', async () => {
      const hash = await hashPassword('密码テスト', 'salt');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('handles very long password', async () => {
      const longPassword = 'a'.repeat(10000);
      const hash = await hashPassword(longPassword, 'salt');
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });
  });
});
