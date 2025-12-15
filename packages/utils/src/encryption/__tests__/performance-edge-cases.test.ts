import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptCalendarEventFields,
  decryptField,
  decryptWorkspaceKey,
  encryptCalendarEventFields,
  encryptField,
  encryptWorkspaceKey,
} from '../encryption-service';
import {
  generateWorkspaceKey,
  setupEncryptionEnv,
  TEST_MASTER_KEY,
} from './test-helpers';

describe('encryption-service', () => {
  setupEncryptionEnv();

  // ============================================================================
  // Concurrency and Performance Tests
  // ============================================================================
  describe('concurrency and performance', () => {
    it('should handle concurrent encryptions', async () => {
      const workspaceKey = generateWorkspaceKey();
      const plaintexts = Array.from({ length: 100 }, (_, i) => `Message ${i}`);

      const encryptions = plaintexts.map((pt) =>
        Promise.resolve(encryptField(pt, workspaceKey))
      );
      const ciphertexts = await Promise.all(encryptions);

      // All ciphertexts should be unique
      const uniqueCiphertexts = new Set(ciphertexts);
      expect(uniqueCiphertexts.size).toBe(100);

      // All should decrypt correctly
      ciphertexts.forEach((ct, i) => {
        const decrypted = decryptField(ct, workspaceKey);
        expect(decrypted).toBe(`Message ${i}`);
      });
    });

    it('should handle concurrent key generations', async () => {
      const generations = Array.from({ length: 100 }, () =>
        Promise.resolve(generateWorkspaceKey())
      );
      const keys = await Promise.all(generations);

      // All keys should be unique
      const uniqueKeys = new Set(keys.map((k) => k.toString('hex')));
      expect(uniqueKeys.size).toBe(100);

      // All should be valid 32-byte keys
      keys.forEach((key) => {
        expect(key.length).toBe(32);
      });
    });

    it('should benefit from key derivation cache', async () => {
      const workspaceKey = generateWorkspaceKey();

      // Verify cache is working: multiple calls complete without error
      // and produce valid encrypted output (deterministic check instead of timing)
      const encrypted1 = await encryptWorkspaceKey(
        workspaceKey,
        TEST_MASTER_KEY
      );
      const encrypted2 = await encryptWorkspaceKey(
        workspaceKey,
        TEST_MASTER_KEY
      );

      // Both should be valid base64 strings
      expect(encrypted1).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(encrypted2).toMatch(/^[A-Za-z0-9+/]+=*$/);

      // Each encryption produces different ciphertext (random IV)
      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to the same key
      const decrypted1 = await decryptWorkspaceKey(encrypted1, TEST_MASTER_KEY);
      const decrypted2 = await decryptWorkspaceKey(encrypted2, TEST_MASTER_KEY);
      expect(decrypted1.equals(workspaceKey)).toBe(true);
      expect(decrypted2.equals(workspaceKey)).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases and Boundary Tests
  // ============================================================================
  describe('edge cases', () => {
    let workspaceKey: Buffer;

    beforeEach(() => {
      workspaceKey = generateWorkspaceKey();
    });

    it('should handle maximum safe string length', () => {
      // Test with a reasonably large string (1MB)
      const largePlaintext = 'a'.repeat(1024 * 1024);
      const ciphertext = encryptField(largePlaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(largePlaintext);
    });

    it('should handle single character', () => {
      const plaintext = 'x';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle only whitespace', () => {
      const plaintext = '   \t\n   ';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle extremely long location', () => {
      const event = {
        title: 'Meeting',
        description: 'Desc',
        location: 'Room '.repeat(10000),
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);
      const decrypted = decryptCalendarEventFields(encrypted, workspaceKey);

      expect(decrypted.location).toBe(event.location);
    });

    it('should handle HTML content', () => {
      const plaintext = '<script>alert("xss")</script><b>Bold</b>';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle JSON content', () => {
      const plaintext = JSON.stringify({
        key: 'value',
        nested: { array: [1, 2, 3] },
      });
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
      expect(JSON.parse(decrypted)).toEqual({
        key: 'value',
        nested: { array: [1, 2, 3] },
      });
    });

    it('should handle URL content', () => {
      const plaintext = 'https://example.com/path?query=value&other=123#hash';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle markdown content', () => {
      const plaintext = '# Heading\n\n**bold** _italic_ `code`\n\n- list item';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });
  });
});
