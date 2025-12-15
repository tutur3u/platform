import { describe, expect, it } from 'vitest';
import { generateWorkspaceKey } from '../encryption-service';

describe('encryption-service', () => {
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

    it('should generate cryptographically random keys', () => {
      // Generate multiple keys and ensure they have reasonable entropy
      const keys: Buffer[] = [];
      for (let i = 0; i < 10; i++) {
        keys.push(generateWorkspaceKey());
      }

      // All keys should be unique
      const uniqueKeys = new Set(keys.map((k) => k.toString('hex')));
      expect(uniqueKeys.size).toBe(10);
    });
  });
});
