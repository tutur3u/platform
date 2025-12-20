/**
 * Tests for Session Encryption Utilities
 *
 * Tests the AES-GCM encryption/decryption for session storage.
 * Uses Node.js webcrypto which is available in Node 15+.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptSession,
  encryptSession,
  isCryptoAvailable,
  validateEncryption,
} from './session-crypto';

// Setup Web Crypto API mock for Node.js environment
const setupCryptoMock = () => {
  // Node.js 15+ has crypto.subtle built-in
  if (typeof globalThis.crypto === 'undefined') {
    const { webcrypto } = require('crypto');
    globalThis.crypto = webcrypto;
  }

  // Mock window for isCryptoAvailable check
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = {
      crypto: globalThis.crypto,
    };
  }
};

describe('Session Crypto', () => {
  beforeEach(() => {
    setupCryptoMock();
  });

  describe('isCryptoAvailable', () => {
    it('should return true when Web Crypto API is available', () => {
      const result = isCryptoAvailable();
      expect(result).toBe(true);
    });

    it('should return false when window is undefined', () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = undefined;

      const result = isCryptoAvailable();
      expect(result).toBe(false);

      (globalThis as any).window = originalWindow;
    });

    it('should return false when crypto is undefined', () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = {};

      const result = isCryptoAvailable();
      expect(result).toBe(false);

      (globalThis as any).window = originalWindow;
    });

    it('should return false when crypto.subtle is undefined', () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = { crypto: {} };

      const result = isCryptoAvailable();
      expect(result).toBe(false);

      (globalThis as any).window = originalWindow;
    });
  });

  describe('encryptSession and decryptSession', () => {
    const testEncryptionKey = 'test-encryption-key-12345';

    it('should encrypt and decrypt simple session data', async () => {
      const sessionData = {
        userId: 'user-123',
        email: 'test@example.com',
        token: 'access-token-xyz',
      };

      const encrypted = await encryptSession(sessionData, testEncryptionKey);

      // Encrypted data should be base64 string
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      // Encrypted data should be different from original
      expect(encrypted).not.toContain('user-123');
      expect(encrypted).not.toContain('test@example.com');

      const decrypted = await decryptSession(encrypted, testEncryptionKey);

      expect(decrypted).toEqual(sessionData);
    });

    it('should encrypt and decrypt complex nested data', async () => {
      const sessionData = {
        user: {
          id: 'user-456',
          profile: {
            name: 'Test User',
            settings: {
              theme: 'dark',
              notifications: true,
            },
          },
        },
        tokens: {
          access: 'access-token',
          refresh: 'refresh-token',
          expiresAt: 1234567890,
        },
        metadata: {
          createdAt: new Date().toISOString(),
          lastActive: Date.now(),
        },
      };

      const encrypted = await encryptSession(sessionData, testEncryptionKey);
      const decrypted = await decryptSession(encrypted, testEncryptionKey);

      expect(decrypted).toEqual(sessionData);
    });

    it('should produce different ciphertext for same data (due to random IV/salt)', async () => {
      const sessionData = { test: 'data' };

      const encrypted1 = await encryptSession(sessionData, testEncryptionKey);
      const encrypted2 = await encryptSession(sessionData, testEncryptionKey);

      // Each encryption should produce different ciphertext
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same data
      const decrypted1 = await decryptSession(encrypted1, testEncryptionKey);
      const decrypted2 = await decryptSession(encrypted2, testEncryptionKey);

      expect(decrypted1).toEqual(sessionData);
      expect(decrypted2).toEqual(sessionData);
    });

    it('should fail to decrypt with wrong key', async () => {
      const sessionData = { secret: 'sensitive-data' };

      const encrypted = await encryptSession(sessionData, testEncryptionKey);

      await expect(decryptSession(encrypted, 'wrong-key')).rejects.toThrow();
    });

    it('should fail to decrypt corrupted data', async () => {
      const sessionData = { data: 'test' };
      const encrypted = await encryptSession(sessionData, testEncryptionKey);

      // Corrupt the encrypted data
      const corrupted = encrypted.slice(0, -10) + 'CORRUPTED!';

      await expect(
        decryptSession(corrupted, testEncryptionKey)
      ).rejects.toThrow();
    });

    it('should handle empty object', async () => {
      const sessionData = {};

      const encrypted = await encryptSession(sessionData, testEncryptionKey);
      const decrypted = await decryptSession(encrypted, testEncryptionKey);

      expect(decrypted).toEqual(sessionData);
    });

    it('should handle arrays in session data', async () => {
      const sessionData = {
        roles: ['admin', 'user'],
        permissions: [1, 2, 3],
        nested: [{ a: 1 }, { b: 2 }],
      };

      const encrypted = await encryptSession(sessionData, testEncryptionKey);
      const decrypted = await decryptSession(encrypted, testEncryptionKey);

      expect(decrypted).toEqual(sessionData);
    });

    it('should throw when crypto is not available during encryption', async () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = undefined;

      await expect(
        encryptSession({ test: 'data' }, testEncryptionKey)
      ).rejects.toThrow('Web Crypto API is not available');

      (globalThis as any).window = originalWindow;
    });

    it('should throw when crypto is not available during decryption', async () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = undefined;

      await expect(
        decryptSession('someEncryptedData', testEncryptionKey)
      ).rejects.toThrow('Web Crypto API is not available');

      (globalThis as any).window = originalWindow;
    });
  });

  describe('validateEncryption', () => {
    it('should return true for valid encryption setup', async () => {
      const result = await validateEncryption('test-key');
      expect(result).toBe(true);
    });

    it('should return false when encryption fails', async () => {
      const originalWindow = globalThis.window;
      (globalThis as any).window = undefined;

      const result = await validateEncryption('test-key');
      expect(result).toBe(false);

      (globalThis as any).window = originalWindow;
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in data', async () => {
      const sessionData = {
        html: '<script>alert("xss")</script>',
        newlines: 'line1\nline2\rline3',
      };

      const encrypted = await encryptSession(sessionData, 'test-key');
      const decrypted = await decryptSession(encrypted, 'test-key');

      expect(decrypted).toEqual(sessionData);
    });

    it('should handle very long strings', async () => {
      const longString = 'x'.repeat(10000);
      const sessionData = { long: longString };

      const encrypted = await encryptSession(sessionData, 'test-key');
      const decrypted = await decryptSession(encrypted, 'test-key');

      expect(decrypted).toEqual(sessionData);
    });

    it('should handle null values', async () => {
      const sessionData = {
        nullValue: null,
        nested: { a: null },
      };

      const encrypted = await encryptSession(sessionData, 'test-key');
      const decrypted = await decryptSession(encrypted, 'test-key');

      expect(decrypted).toEqual(sessionData);
    });

    it('should handle boolean values', async () => {
      const sessionData = {
        active: true,
        verified: false,
      };

      const encrypted = await encryptSession(sessionData, 'test-key');
      const decrypted = await decryptSession(encrypted, 'test-key');

      expect(decrypted).toEqual(sessionData);
    });

    it('should handle numeric values', async () => {
      const sessionData = {
        integer: 42,
        float: 3.14159,
        negative: -100,
        zero: 0,
        large: Number.MAX_SAFE_INTEGER,
      };

      const encrypted = await encryptSession(sessionData, 'test-key');
      const decrypted = await decryptSession(encrypted, 'test-key');

      expect(decrypted).toEqual(sessionData);
    });
  });
});
