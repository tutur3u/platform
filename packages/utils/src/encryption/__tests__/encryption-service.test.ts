import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptCalendarEventFields,
  decryptField,
  decryptWorkspaceKey,
  encryptCalendarEventFields,
  encryptField,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  isEncryptionEnabled,
} from '../encryption-service';

describe('encryption-service', () => {
  const TEST_MASTER_KEY = 'test-master-key-for-unit-testing-only';
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENCRYPTION_MASTER_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
  });

  describe('generateWorkspaceKey', () => {
    it('should generate a 256-bit key', () => {
      const key = generateWorkspaceKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32); // 256 bits = 32 bytes
    });

    it('should generate unique keys each time', () => {
      const key1 = generateWorkspaceKey();
      const key2 = generateWorkspaceKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('workspace key encryption/decryption', () => {
    it('should encrypt and decrypt workspace key correctly', () => {
      const originalKey = generateWorkspaceKey();
      const encryptedKey = encryptWorkspaceKey(originalKey, TEST_MASTER_KEY);

      expect(encryptedKey).toBeTruthy();
      expect(typeof encryptedKey).toBe('string');

      const decryptedKey = decryptWorkspaceKey(encryptedKey, TEST_MASTER_KEY);
      expect(decryptedKey.equals(originalKey)).toBe(true);
    });

    it('should produce different ciphertext for same key (random IV)', () => {
      const key = generateWorkspaceKey();
      const encrypted1 = encryptWorkspaceKey(key, TEST_MASTER_KEY);
      const encrypted2 = encryptWorkspaceKey(key, TEST_MASTER_KEY);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail decryption with wrong master key', () => {
      const key = generateWorkspaceKey();
      const encryptedKey = encryptWorkspaceKey(key, TEST_MASTER_KEY);

      expect(() => {
        decryptWorkspaceKey(encryptedKey, 'wrong-master-key');
      }).toThrow();
    });
  });

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

    it('should fail decryption with wrong key', () => {
      const wrongKey = generateWorkspaceKey();
      const ciphertext = encryptField('Secret', workspaceKey);

      expect(() => {
        decryptField(ciphertext, wrongKey);
      }).toThrow();
    });
  });

  describe('calendar event field encryption', () => {
    let workspaceKey: Buffer;

    beforeEach(() => {
      workspaceKey = generateWorkspaceKey();
    });

    it('should encrypt and decrypt calendar event fields', () => {
      const event = {
        title: 'Team Standup',
        description: 'Daily standup meeting',
        location: 'Conference Room A',
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);

      expect(encrypted.title).not.toBe(event.title);
      expect(encrypted.description).not.toBe(event.description);
      expect(encrypted.location).not.toBe(event.location);

      const decrypted = decryptCalendarEventFields(encrypted, workspaceKey);

      expect(decrypted.title).toBe(event.title);
      expect(decrypted.description).toBe(event.description);
      expect(decrypted.location).toBe(event.location);
    });

    it('should handle undefined location', () => {
      const event = {
        title: 'Phone Call',
        description: 'Quick sync call',
        location: undefined,
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);
      expect(encrypted.location).toBeUndefined();

      const decrypted = decryptCalendarEventFields(encrypted, workspaceKey);
      expect(decrypted.location).toBeUndefined();
    });

    it('should handle empty title and description', () => {
      const event = {
        title: '',
        description: '',
        location: undefined, // Empty location should be undefined
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);
      const decrypted = decryptCalendarEventFields(encrypted, workspaceKey);

      expect(decrypted.title).toBe('');
      expect(decrypted.description).toBe('');
      expect(decrypted.location).toBeUndefined();
    });
  });

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
  });
});
