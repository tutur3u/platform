import { beforeEach, describe, expect, it } from 'vitest';
import { decryptField, encryptField } from '../encryption-service';
import { generateWorkspaceKey } from './test-helpers';

describe('encryption-service', () => {
  // ============================================================================
  // Field Encryption/Decryption Tests
  // ============================================================================
  describe('field encryption/decryption', () => {
    let workspaceKey: Buffer;

    beforeEach(() => {
      workspaceKey = generateWorkspaceKey();
    });

    it('should encrypt and decrypt string field correctly', () => {
      const plaintext = 'Team Meeting';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const ciphertext = encryptField('', workspaceKey);
      expect(ciphertext).toBe('');

      const decrypted = decryptField('', workspaceKey);
      expect(decrypted).toBe('');
    });

    it('should handle Unicode characters (Vietnamese)', () => {
      const plaintext = 'Cuộc họp nhóm buổi sáng';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle emoji', () => {
      const plaintext = '🎉 Birthday Party 🎂';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text', () => {
      const plaintext =
        'This is a very long description that contains multiple sentences. '.repeat(
          100
        );
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'Same text';
      const ciphertext1 = encryptField(plaintext, workspaceKey);
      const ciphertext2 = encryptField(plaintext, workspaceKey);

      expect(ciphertext1).not.toBe(ciphertext2);
    });

    it('should fail decryption with wrong key and return original (backward compat)', () => {
      const wrongKey = generateWorkspaceKey();
      const ciphertext = encryptField('Secret', workspaceKey);

      // With the new try-catch, it returns original ciphertext for backward compatibility
      const result = decryptField(ciphertext, wrongKey);
      expect(result).toBe(ciphertext);
    });

    it('should fail decryption when ciphertext is tampered and return original', () => {
      const plaintext = 'Sensitive Meeting Notes';
      const ciphertext = encryptField(plaintext, workspaceKey);

      // Tamper with a byte in the middle of the ciphertext
      const midIndex = Math.floor(ciphertext.length / 2);
      const tamperedChar =
        ciphertext[midIndex] === 'A'
          ? 'B'
          : ciphertext[midIndex] === 'a'
            ? 'b'
            : 'X';
      const tamperedCiphertext =
        ciphertext.slice(0, midIndex) +
        tamperedChar +
        ciphertext.slice(midIndex + 1);

      // Ensure we actually changed something
      expect(tamperedCiphertext).not.toBe(ciphertext);
      expect(tamperedCiphertext.length).toBe(ciphertext.length);

      // With try-catch wrapper, should return original ciphertext
      const result = decryptField(tamperedCiphertext, workspaceKey);
      expect(result).toBe(tamperedCiphertext);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle newlines and tabs', () => {
      const plaintext = 'Line 1\nLine 2\tTabbed\rCarriage return';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle mixed languages', () => {
      const plaintext = 'English 日本語 العربية עברית';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle null bytes', () => {
      const plaintext = 'Before\x00After';
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ============================================================================
  // Key Validation Tests
  // ============================================================================
  describe('key validation', () => {
    it('should throw error for non-Buffer workspace key', () => {
      expect(() => {
        encryptField('test', 'not-a-buffer' as unknown as Buffer);
      }).toThrow('Invalid workspaceKey: expected Buffer, got string');
    });

    it('should throw error for wrong key length', () => {
      const shortKey = Buffer.alloc(16); // 128 bits instead of 256

      expect(() => {
        encryptField('test', shortKey);
      }).toThrow(
        'Invalid workspaceKey: expected 32 bytes for AES-256, got 16 bytes'
      );
    });

    it('should throw error for too long key', () => {
      const longKey = Buffer.alloc(64); // 512 bits

      expect(() => {
        encryptField('test', longKey);
      }).toThrow(
        'Invalid workspaceKey: expected 32 bytes for AES-256, got 64 bytes'
      );
    });

    it('should accept valid 32-byte key', () => {
      const validKey = generateWorkspaceKey();
      expect(() => {
        encryptField('test', validKey);
      }).not.toThrow();
    });

    it('should throw for null workspace key', () => {
      expect(() => {
        encryptField('test', null as unknown as Buffer);
      }).toThrow('Invalid workspaceKey: expected Buffer, got object');
    });

    it('should throw for undefined workspace key', () => {
      expect(() => {
        encryptField('test', undefined as unknown as Buffer);
      }).toThrow('Invalid workspaceKey: expected Buffer, got undefined');
    });

    it('should throw for array workspace key', () => {
      expect(() => {
        encryptField('test', [1, 2, 3] as unknown as Buffer);
      }).toThrow('Invalid workspaceKey: expected Buffer, got object');
    });
  });

  // ============================================================================
  // Decryption Error Handling Tests
  // ============================================================================
  describe('decryption error handling', () => {
    let workspaceKey: Buffer;

    beforeEach(() => {
      workspaceKey = generateWorkspaceKey();
    });

    it('should return original for too-short ciphertext', () => {
      const shortCiphertext = 'abc'; // Too short to be valid encrypted data

      const result = decryptField(shortCiphertext, workspaceKey);
      expect(result).toBe(shortCiphertext);
    });

    it('should return original for invalid base64', () => {
      // Invalid base64 will decode to something short
      const invalidBase64 = '!!!invalid!!!';

      const result = decryptField(invalidBase64, workspaceKey);
      expect(result).toBe(invalidBase64);
    });

    it('should return original for corrupted auth tag', () => {
      const plaintext = 'Secret data';
      const ciphertext = encryptField(plaintext, workspaceKey);

      // Corrupt the last few characters (auth tag area)
      const corrupted = `${ciphertext.slice(0, -4)}XXXX`;

      const result = decryptField(corrupted, workspaceKey);
      expect(result).toBe(corrupted);
    });

    it('should handle extremely long ciphertext gracefully', () => {
      const plaintext = 'x'.repeat(100000);
      const ciphertext = encryptField(plaintext, workspaceKey);
      const decrypted = decryptField(ciphertext, workspaceKey);

      expect(decrypted).toBe(plaintext);
    });
  });
});
