import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptCalendarEventFields,
  decryptCalendarEvents,
  decryptField,
  decryptWorkspaceKey,
  encryptCalendarEventFields,
  encryptCalendarEvents,
  encryptField,
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
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

  // ============================================================================
  // Key Generation Tests
  // ============================================================================
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

  // ============================================================================
  // Workspace Key Encryption/Decryption Tests
  // ============================================================================
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

      // Corrupt the encrypted data
      const corrupted = encrypted.slice(0, 10) + 'X' + encrypted.slice(11);

      await expect(
        decryptWorkspaceKey(corrupted, TEST_MASTER_KEY)
      ).rejects.toThrow();
    });
  });

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
      const corrupted = ciphertext.slice(0, -4) + 'XXXX';

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

  // ============================================================================
  // Calendar Event Field Encryption Tests
  // ============================================================================
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
        location: undefined,
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);
      const decrypted = decryptCalendarEventFields(encrypted, workspaceKey);

      expect(decrypted.title).toBe('');
      expect(decrypted.description).toBe('');
      expect(decrypted.location).toBeUndefined();
    });

    it('should handle null title and description', () => {
      const event = {
        title: null as unknown as string,
        description: null as unknown as string,
        location: undefined,
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);
      const decrypted = decryptCalendarEventFields(encrypted, workspaceKey);

      expect(decrypted.title).toBe('');
      expect(decrypted.description).toBe('');
    });

    it('should preserve non-encrypted fields', () => {
      const event = {
        title: 'Meeting',
        description: 'Important meeting',
        location: 'Room 101',
      };

      const encrypted = encryptCalendarEventFields(event, workspaceKey);

      // Only title, description, location should be in the result
      expect(Object.keys(encrypted)).toEqual([
        'title',
        'description',
        'location',
      ]);
    });
  });

  // ============================================================================
  // Batch Encryption/Decryption Tests
  // ============================================================================
  describe('batch calendar event operations', () => {
    let workspaceKey: Buffer;

    beforeEach(() => {
      workspaceKey = generateWorkspaceKey();
    });

    describe('encryptCalendarEvents', () => {
      it('should encrypt multiple events', () => {
        const events = [
          { title: 'Event 1', description: 'Desc 1', location: 'Loc 1' },
          { title: 'Event 2', description: 'Desc 2', location: undefined },
          { title: 'Event 3', description: '', location: 'Loc 3' },
        ];

        const encrypted = encryptCalendarEvents(events, workspaceKey);

        expect(encrypted).toHaveLength(3);
        encrypted.forEach((event, index) => {
          expect(event.is_encrypted).toBe(true);
          // Non-empty fields should be encrypted (different from original)
          if (events[index]!.title) {
            expect(event.title).not.toBe(events[index]!.title);
          }
          if (events[index]!.description) {
            expect(event.description).not.toBe(events[index]!.description);
          }
        });
      });

      it('should handle empty array', () => {
        const encrypted = encryptCalendarEvents([], workspaceKey);
        expect(encrypted).toEqual([]);
      });

      it('should preserve additional event properties', () => {
        const events = [
          {
            title: 'Event',
            description: 'Desc',
            location: 'Loc',
            start_at: '2024-01-01T10:00:00Z',
            end_at: '2024-01-01T11:00:00Z',
            color: 'blue',
          },
        ];

        const encrypted = encryptCalendarEvents(events, workspaceKey);

        expect(encrypted[0]!.start_at).toBe('2024-01-01T10:00:00Z');
        expect(encrypted[0]!.end_at).toBe('2024-01-01T11:00:00Z');
        expect(encrypted[0]!.color).toBe('blue');
        expect(encrypted[0]!.is_encrypted).toBe(true);
      });
    });

    describe('decryptCalendarEvents', () => {
      it('should decrypt multiple encrypted events', () => {
        const originalEvents = [
          { title: 'Event 1', description: 'Desc 1', location: 'Loc 1' },
          { title: 'Event 2', description: 'Desc 2', location: 'Loc 2' },
        ];

        const encrypted = encryptCalendarEvents(originalEvents, workspaceKey);

        // Add required fields for CalendarEventWithEncryption
        const eventsWithMetadata = encrypted.map((event, index) => ({
          ...event,
          id: `event-${index}`,
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
          color: 'blue' as const,
          ws_id: 'ws-123',
        }));

        const decrypted = decryptCalendarEvents(
          eventsWithMetadata,
          workspaceKey
        );

        expect(decrypted).toHaveLength(2);
        decrypted.forEach((event, index) => {
          expect(event.title).toBe(originalEvents[index]!.title);
          expect(event.description).toBe(originalEvents[index]!.description);
          expect(event.location).toBe(originalEvents[index]!.location);
        });
      });

      it('should skip non-encrypted events', () => {
        const events = [
          {
            id: 'event-1',
            title: 'Plaintext Event',
            description: 'Plaintext Desc',
            location: 'Plaintext Loc',
            start_at: '2024-01-01T10:00:00Z',
            end_at: '2024-01-01T11:00:00Z',
            color: 'blue' as const,
            ws_id: 'ws-123',
            is_encrypted: false,
          },
        ];

        const result = decryptCalendarEvents(events, workspaceKey);

        expect(result[0]!.title).toBe('Plaintext Event');
        expect(result[0]!.description).toBe('Plaintext Desc');
      });

      it('should handle mixed encrypted and non-encrypted events', () => {
        const encryptedEvent = encryptCalendarEventFields(
          { title: 'Encrypted', description: 'Secret', location: 'Hidden' },
          workspaceKey
        );

        const events = [
          {
            id: 'event-1',
            ...encryptedEvent,
            location: encryptedEvent.location ?? null,
            start_at: '2024-01-01T10:00:00Z',
            end_at: '2024-01-01T11:00:00Z',
            color: 'blue' as const,
            ws_id: 'ws-123',
            is_encrypted: true,
          },
          {
            id: 'event-2',
            title: 'Public',
            description: 'Visible',
            location: 'Open' as string | null,
            start_at: '2024-01-01T12:00:00Z',
            end_at: '2024-01-01T13:00:00Z',
            color: 'red' as const,
            ws_id: 'ws-123',
            is_encrypted: false,
          },
        ];

        const decrypted = decryptCalendarEvents(events, workspaceKey);

        expect(decrypted[0]!.title).toBe('Encrypted');
        expect(decrypted[1]!.title).toBe('Public');
      });

      it('should handle empty array', () => {
        const result = decryptCalendarEvents([], workspaceKey);
        expect(result).toEqual([]);
      });

      it('should handle events with null fields', () => {
        const events = [
          {
            id: 'event-1',
            title: null as unknown as string,
            description: null as unknown as string,
            location: null,
            start_at: '2024-01-01T10:00:00Z',
            end_at: '2024-01-01T11:00:00Z',
            color: 'blue' as const,
            ws_id: 'ws-123',
            is_encrypted: true, // Marked as encrypted but with null values
          },
        ];

        // Should not throw (tests backward compatibility with malformed data)
        expect(() => {
          decryptCalendarEvents(events as any, workspaceKey);
        }).not.toThrow();
      });
    });
  });

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

    it('should return true for whitespace-only key', () => {
      process.env.ENCRYPTION_MASTER_KEY = '   ';
      expect(isEncryptionEnabled()).toBe(true);
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

      // First encryption (cache miss)
      const start1 = Date.now();
      await encryptWorkspaceKey(workspaceKey, TEST_MASTER_KEY);
      const time1 = Date.now() - start1;

      // Second encryption (cache hit)
      const start2 = Date.now();
      await encryptWorkspaceKey(workspaceKey, TEST_MASTER_KEY);
      const time2 = Date.now() - start2;

      // Cache hit should be faster (or at least not slower)
      // Note: This is a probabilistic test, may occasionally fail due to system load
      expect(time2).toBeLessThanOrEqual(time1 + 10); // Allow 10ms margin
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
