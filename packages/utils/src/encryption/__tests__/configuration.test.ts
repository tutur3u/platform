import { beforeEach, describe, expect, it } from 'vitest';
import {
  encryptField,
  getMasterKey,
  isEncryptionEnabled,
} from '../encryption-service';
import {
  generateWorkspaceKey,
  setupEncryptionEnv,
  TEST_MASTER_KEY,
} from './test-helpers';

describe('encryption-service', () => {
  setupEncryptionEnv();

  // ============================================================================
  // Environment and Configuration Tests
  // ============================================================================
  describe('isEncryptionEnabled', () => {
    it('should return false when master key is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(isEncryptionEnabled()).toBe(false);
    });

    it('should return true when master key is set', () => {
      process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('should return false for empty string', () => {
      process.env.ENCRYPTION_MASTER_KEY = '';
      expect(isEncryptionEnabled()).toBe(false);
    });

    it('should return false for whitespace-only key', () => {
      process.env.ENCRYPTION_MASTER_KEY = '   ';
      expect(isEncryptionEnabled()).toBe(false);
    });
  });

  describe('getMasterKey', () => {
    it('should return master key when set', () => {
      process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
      expect(getMasterKey()).toBe(TEST_MASTER_KEY);
    });

    it('should throw when master key is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(() => getMasterKey()).toThrow(
        'ENCRYPTION_MASTER_KEY environment variable is not configured'
      );
    });

    it('should throw for empty string', () => {
      process.env.ENCRYPTION_MASTER_KEY = '';
      expect(() => getMasterKey()).toThrow(
        'ENCRYPTION_MASTER_KEY environment variable is not configured'
      );
    });
  });

  // ============================================================================
  // Ciphertext Format and Security Tests
  // ============================================================================
  describe('ciphertext format validation', () => {
    let workspaceKey: Buffer;

    beforeEach(() => {
      workspaceKey = generateWorkspaceKey();
    });

    it('should produce base64-encoded ciphertext', () => {
      const ciphertext = encryptField('test', workspaceKey);

      // Valid base64 pattern
      expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should produce ciphertext with minimum length', () => {
      const ciphertext = encryptField('x', workspaceKey);
      const decoded = Buffer.from(ciphertext, 'base64');

      // Minimum: 12 (IV) + 1 (ciphertext for 'x') + 16 (auth tag)
      expect(decoded.length).toBeGreaterThanOrEqual(29);
    });

    it('ciphertext length should grow with plaintext length', () => {
      const short = encryptField('a', workspaceKey);
      const medium = encryptField('a'.repeat(100), workspaceKey);
      const long = encryptField('a'.repeat(1000), workspaceKey);

      const shortLen = Buffer.from(short, 'base64').length;
      const mediumLen = Buffer.from(medium, 'base64').length;
      const longLen = Buffer.from(long, 'base64').length;

      expect(mediumLen).toBeGreaterThan(shortLen);
      expect(longLen).toBeGreaterThan(mediumLen);
    });

    it('should not leak plaintext in ciphertext', () => {
      const plaintext = 'TOP SECRET MESSAGE';
      const ciphertext = encryptField(plaintext, workspaceKey);

      // Plaintext should not appear in ciphertext
      expect(ciphertext).not.toContain('TOP');
      expect(ciphertext).not.toContain('SECRET');
      expect(ciphertext).not.toContain('MESSAGE');

      // Also check the raw bytes
      const decoded = Buffer.from(ciphertext, 'base64');
      expect(decoded.toString('utf8')).not.toContain('TOP');
    });
  });
});
