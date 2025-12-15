import { describe, expect, it } from 'vitest';
import {
  decryptWorkspaceKey,
  encryptWorkspaceKey,
} from '../encryption-service';
import {
  generateWorkspaceKey,
  setupEncryptionEnv,
  TEST_MASTER_KEY,
} from './test-helpers';

describe('encryption-service', () => {
  setupEncryptionEnv();

  describe('workspace key encryption/decryption', () => {
    it('should encrypt and decrypt workspace key correctly', async () => {
      const originalKey = generateWorkspaceKey();
      const encryptedKey = await encryptWorkspaceKey(
        originalKey,
        TEST_MASTER_KEY
      );

      expect(encryptedKey).toBeTruthy();
      expect(typeof encryptedKey).toBe('string');

      const decryptedKey = await decryptWorkspaceKey(
        encryptedKey,
        TEST_MASTER_KEY
      );
      expect(decryptedKey.equals(originalKey)).toBe(true);
    });

    it('should produce different ciphertext for same key (random IV)', async () => {
      const key = generateWorkspaceKey();
      const encrypted1 = await encryptWorkspaceKey(key, TEST_MASTER_KEY);
      const encrypted2 = await encryptWorkspaceKey(key, TEST_MASTER_KEY);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail decryption with wrong master key', async () => {
      const key = generateWorkspaceKey();
      const encryptedKey = await encryptWorkspaceKey(key, TEST_MASTER_KEY);

      await expect(
        decryptWorkspaceKey(encryptedKey, 'wrong-master-key')
      ).rejects.toThrow();
    });

    it('should handle different master key lengths', async () => {
      const key = generateWorkspaceKey();

      // Short master key
      const shortMasterKey = 'short';
      const encrypted1 = await encryptWorkspaceKey(key, shortMasterKey);
      const decrypted1 = await decryptWorkspaceKey(encrypted1, shortMasterKey);
      expect(decrypted1.equals(key)).toBe(true);

      // Long master key
      const longMasterKey = 'a'.repeat(256);
      const encrypted2 = await encryptWorkspaceKey(key, longMasterKey);
      const decrypted2 = await decryptWorkspaceKey(encrypted2, longMasterKey);
      expect(decrypted2.equals(key)).toBe(true);
    });

    it('should produce valid base64 encoded output', async () => {
      const key = generateWorkspaceKey();
      const encrypted = await encryptWorkspaceKey(key, TEST_MASTER_KEY);

      // Should be valid base64
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();

      // Decoded buffer should have minimum length (IV + ciphertext + authTag)
      const decoded = Buffer.from(encrypted, 'base64');
      expect(decoded.length).toBeGreaterThanOrEqual(12 + 32 + 16); // IV + key + tag
    });

    it('should fail on corrupted encrypted key', async () => {
      const key = generateWorkspaceKey();
      const encrypted = await encryptWorkspaceKey(key, TEST_MASTER_KEY);

      // Corrupt the encrypted data by modifying the auth tag (last 16 bytes)
      // This guarantees decryption will fail because AES-GCM uses auth tag for integrity
      const decoded = Buffer.from(encrypted, 'base64');
      // Flip bits in the auth tag (last 16 bytes) - decoded is guaranteed to have min size
      const lastIdx = decoded.length - 1;
      const secondLastIdx = decoded.length - 2;
      decoded.writeUInt8(decoded.readUInt8(lastIdx) ^ 0xff, lastIdx);
      decoded.writeUInt8(
        decoded.readUInt8(secondLastIdx) ^ 0xff,
        secondLastIdx
      );
      const corrupted = decoded.toString('base64');

      await expect(
        decryptWorkspaceKey(corrupted, TEST_MASTER_KEY)
      ).rejects.toThrow();
    });
  });
});
