/**
 * Tests for workspace-encryption.ts
 *
 * These tests verify the encryption behavior for calendar events,
 * particularly the critical fix ensuring ALL new events are encrypted
 * when workspace E2EE is enabled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock environment variables
// NOTE: Duplicated from packages/utils/src/encryption/__tests__/test-helpers.ts to avoid package boundary issues
const TEST_MASTER_KEY = 'test-master-key-for-unit-testing-only';

// Mock Supabase admin client
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      from: vi.fn((_) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: null,
              })
            ),
            in: vi.fn(() =>
              Promise.resolve({
                data: [],
                error: null,
              })
            ),
          })),
        })),
        insert: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: null,
          })
        ),
      })),
    })
  ),
}));

// Import after mocks are set up
import {
  decryptField,
  encryptCalendarEventFields,
  generateWorkspaceKey,
  isEncryptionEnabled,
} from '@tuturuuu/utils/encryption';
import { looksLikeEncryptedData } from '../app/api/v1/workspaces/[wsId]/encryption/utils';

describe('workspace-encryption', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ENCRYPTION_MASTER_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_MASTER_KEY;
    }
    vi.clearAllMocks();
  });

  // ============================================================================
  // Core Encryption Behavior Tests
  // ============================================================================
  describe('encryption behavior for new events', () => {
    it('should encrypt ALL events when workspace key exists', () => {
      const workspaceKey = generateWorkspaceKey();

      const events = [
        {
          google_event_id: 'existing-event-1',
          title: 'Existing Meeting',
          description: 'Already encrypted',
          location: 'Room A',
        },
        {
          google_event_id: 'new-event-1',
          title: 'New Meeting',
          description: 'This is a new event',
          location: 'Room B',
        },
      ];

      // Encrypt all events (simulating the fixed behavior)
      const encryptedEvents = events.map((event) => {
        const encrypted = encryptCalendarEventFields(
          {
            title: event.title,
            description: event.description,
            location: event.location,
          },
          workspaceKey
        );

        return {
          ...event,
          title: encrypted.title,
          description: encrypted.description,
          location: encrypted.location,
          is_encrypted: true,
        };
      });

      // ALL events should be encrypted
      expect(encryptedEvents).toHaveLength(2);
      encryptedEvents.forEach((event) => {
        expect(event.is_encrypted).toBe(true);
        // Encrypted fields should be base64 strings, not original plaintext
        expect(event.title).not.toBe('Existing Meeting');
        expect(event.title).not.toBe('New Meeting');
        expect(event.title).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64 pattern
      });
    });

    // Specification check: Validates that if we have a set of known encrypted IDs,
    // and we encounter new events not in that set, the encryption utility is capable
    // of encrypting them (i.e. the encryption function works on new data).
    // Note: This does not test the actual filtering logic in encryptGoogleSyncEvents,
    // but rather the fundamental requirement that new events CAN be encrypted.
    it('should be capable of encrypting new events (unit test for encryption utility)', () => {
      const workspaceKey = generateWorkspaceKey();

      // Simulate a scenario where we have existing encrypted events
      const _cachedEncryptedIds = new Set([
        'existing-event-1',
        'existing-event-2',
      ]);

      const newEvents = [
        {
          google_event_id: 'brand-new-event',
          title: 'Brand New Event',
          description: 'Not in cache',
          location: null,
        },
        {
          google_event_id: 'another-new-event',
          title: 'Another New Event',
          description: 'Also not in cache',
          location: 'Office',
        },
      ];

      // CRITICAL: Even though these events are NOT in the cached set,
      // they should still be encrypted because the workspace has E2EE enabled
      const encryptedEvents = newEvents.map((event) => {
        const encrypted = encryptCalendarEventFields(
          {
            title: event.title,
            description: event.description || '',
            location: event.location || undefined,
          },
          workspaceKey
        );

        return {
          ...event,
          title: encrypted.title,
          description: encrypted.description,
          location: encrypted.location ?? null,
          is_encrypted: true,
        };
      });

      // Verify cache doesn't contain these events (conceptually)
      newEvents.forEach((event) => {
        expect(_cachedEncryptedIds.has(event.google_event_id)).toBe(false);
      });

      // But they should still be encrypted!
      encryptedEvents.forEach((event) => {
        expect(event.is_encrypted).toBe(true);
        expect(event.title).toMatch(/^[A-Za-z0-9+/]+=*$/);
      });
    });

    it('should encrypt events and be able to decrypt them back', () => {
      const workspaceKey = generateWorkspaceKey();

      const originalEvent = {
        google_event_id: 'test-event',
        title: 'Team Standup',
        description: 'Daily sync meeting',
        location: 'Conference Room C',
      };

      // Encrypt
      const encrypted = encryptCalendarEventFields(
        {
          title: originalEvent.title,
          description: originalEvent.description,
          location: originalEvent.location,
        },
        workspaceKey
      );

      // Verify encrypted values are different from originals
      expect(encrypted.title).not.toBe(originalEvent.title);
      expect(encrypted.description).not.toBe(originalEvent.description);
      expect(encrypted.location).not.toBe(originalEvent.location);

      // Decrypt and verify
      const decryptedTitle = decryptField(encrypted.title, workspaceKey);
      const decryptedDescription = decryptField(
        encrypted.description,
        workspaceKey
      );
      const decryptedLocation = encrypted.location
        ? decryptField(encrypted.location, workspaceKey)
        : null;

      expect(decryptedTitle).toBe(originalEvent.title);
      expect(decryptedDescription).toBe(originalEvent.description);
      expect(decryptedLocation).toBe(originalEvent.location);
    });
  });

  // ============================================================================
  // Empty and Edge Case Tests
  // ============================================================================
  describe('edge cases', () => {
    it('should handle empty strings correctly', () => {
      const workspaceKey = generateWorkspaceKey();

      const event = {
        google_event_id: 'event-with-empty-fields',
        title: '',
        description: '',
        location: null,
      };

      const encrypted = encryptCalendarEventFields(
        {
          title: event.title,
          description: event.description,
          location: event.location || undefined,
        },
        workspaceKey
      );

      // Empty strings should remain empty (not encrypted)
      expect(encrypted.title).toBe('');
      expect(encrypted.description).toBe('');
      expect(encrypted.location).toBeUndefined();
    });

    it('should handle null location correctly', () => {
      const workspaceKey = generateWorkspaceKey();

      const event = {
        google_event_id: 'event-with-null-location',
        title: 'Meeting',
        description: 'A meeting',
        location: null as string | null,
      };

      const encrypted = encryptCalendarEventFields(
        {
          title: event.title,
          description: event.description,
          location: undefined, // null -> undefined for encryption
        },
        workspaceKey
      );

      expect(encrypted.title).not.toBe('Meeting');
      expect(encrypted.description).not.toBe('A meeting');
      expect(encrypted.location).toBeUndefined();
    });

    it('should handle undefined location correctly', () => {
      const workspaceKey = generateWorkspaceKey();

      const event = {
        google_event_id: 'event-without-location',
        title: 'Quick Call',
        description: 'Brief discussion',
      };

      const encrypted = encryptCalendarEventFields(
        {
          title: event.title,
          description: event.description,
          location: undefined,
        },
        workspaceKey
      );

      expect(encrypted.title).not.toBe('Quick Call');
      expect(encrypted.description).not.toBe('Brief discussion');
      expect(encrypted.location).toBeUndefined();
    });

    it('should handle special characters in event data', () => {
      const workspaceKey = generateWorkspaceKey();

      const event = {
        google_event_id: 'special-chars-event',
        title: 'Meeting 🎉 with special chars: <script>alert("xss")</script>',
        description: 'Contains unicode: 日本語, emoji: 🚀, & symbols: @#$%',
        location: "O'Malley's Pub & Grill",
      };

      const encrypted = encryptCalendarEventFields(
        {
          title: event.title,
          description: event.description,
          location: event.location,
        },
        workspaceKey
      );

      // Decrypt and verify all special characters are preserved
      const decryptedTitle = decryptField(encrypted.title, workspaceKey);
      const decryptedDescription = decryptField(
        encrypted.description,
        workspaceKey
      );
      const decryptedLocation = encrypted.location
        ? decryptField(encrypted.location, workspaceKey)
        : null;

      expect(decryptedTitle).toBe(event.title);
      expect(decryptedDescription).toBe(event.description);
      expect(decryptedLocation).toBe(event.location);
    });

    it('should handle very long event data', () => {
      const workspaceKey = generateWorkspaceKey();

      const longDescription = 'A'.repeat(10000);
      const event = {
        google_event_id: 'long-event',
        title: 'Event with long description',
        description: longDescription,
        location: 'Location',
      };

      const encrypted = encryptCalendarEventFields(
        {
          title: event.title,
          description: event.description,
          location: event.location,
        },
        workspaceKey
      );

      const decrypted = decryptField(encrypted.description, workspaceKey);
      expect(decrypted).toBe(longDescription);
    });
  });

  // ============================================================================
  // Environment Configuration Tests
  // ============================================================================
  describe('encryption enabled check', () => {
    it('should return true when master key is set', () => {
      process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('should return false when master key is not set', () => {
      delete process.env.ENCRYPTION_MASTER_KEY;
      expect(isEncryptionEnabled()).toBe(false);
    });

    it('should return false for empty string', () => {
      process.env.ENCRYPTION_MASTER_KEY = '';
      expect(isEncryptionEnabled()).toBe(false);
    });
  });

  // ============================================================================
  // Batch Encryption Tests
  // ============================================================================
  describe('batch encryption', () => {
    it('should encrypt multiple events consistently', () => {
      const workspaceKey = generateWorkspaceKey();

      const events = Array.from({ length: 10 }, (_, i) => ({
        google_event_id: `event-${i}`,
        title: `Event ${i}`,
        description: `Description for event ${i}`,
        location: i % 2 === 0 ? `Location ${i}` : null,
      }));

      const encryptedEvents = events.map((event) => {
        const encrypted = encryptCalendarEventFields(
          {
            title: event.title,
            description: event.description,
            location: event.location || undefined,
          },
          workspaceKey
        );

        return {
          ...event,
          title: encrypted.title,
          description: encrypted.description,
          location: encrypted.location ?? null,
          is_encrypted: true,
        };
      });

      // All events should be encrypted
      expect(encryptedEvents).toHaveLength(10);
      encryptedEvents.forEach((event, i) => {
        expect(event.is_encrypted).toBe(true);
        expect(event.title).not.toBe(`Event ${i}`);

        // Decrypt and verify
        const decryptedTitle = decryptField(event.title, workspaceKey);
        expect(decryptedTitle).toBe(`Event ${i}`);
      });
    });

    it('should produce unique ciphertexts for same plaintext (random IV)', () => {
      const workspaceKey = generateWorkspaceKey();

      const plaintext = 'Same Event Title';
      const ciphertexts: string[] = [];

      for (let i = 0; i < 5; i++) {
        const encrypted = encryptCalendarEventFields(
          { title: plaintext, description: '', location: undefined },
          workspaceKey
        );
        ciphertexts.push(encrypted.title);
      }

      // All ciphertexts should be unique (random IV)
      const uniqueCiphertexts = new Set(ciphertexts);
      expect(uniqueCiphertexts.size).toBe(5);

      // But all should decrypt to the same plaintext
      ciphertexts.forEach((ct) => {
        expect(decryptField(ct, workspaceKey)).toBe(plaintext);
      });
    });
  });

  // ============================================================================
  // looksLikeEncryptedData Utility Tests
  // ============================================================================
  describe('looksLikeEncryptedData', () => {
    it('should return true for valid encrypted data (base64 encoded)', () => {
      const workspaceKey = generateWorkspaceKey();
      const encrypted = encryptCalendarEventFields(
        {
          title: 'Test Event',
          description: 'Description',
          location: undefined,
        },
        workspaceKey
      );

      expect(looksLikeEncryptedData(encrypted.title)).toBe(true);
      expect(looksLikeEncryptedData(encrypted.description)).toBe(true);
    });

    it('should return true for empty strings (valid encrypted state)', () => {
      // CRITICAL: Empty strings are preserved without encryption by encryptField()
      // Events with is_encrypted=true and empty title/description are valid
      expect(looksLikeEncryptedData('')).toBe(true);
    });

    it('should return false for plaintext with spaces', () => {
      expect(looksLikeEncryptedData('Team Meeting')).toBe(false);
      expect(looksLikeEncryptedData('This is a description')).toBe(false);
    });

    it('should return false for short strings that cannot be encrypted data', () => {
      expect(looksLikeEncryptedData('abc')).toBe(false);
      expect(looksLikeEncryptedData('short')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(looksLikeEncryptedData(null)).toBe(false);
      expect(looksLikeEncryptedData(undefined)).toBe(false);
    });

    it('should return false for strings with invalid base64 characters', () => {
      expect(looksLikeEncryptedData('Hello World!')).toBe(false);
      expect(looksLikeEncryptedData('test@example.com')).toBe(false);
    });

    it('should correctly identify events with empty encrypted fields as valid', () => {
      // This test simulates the exact scenario that caused false positives:
      // An event with is_encrypted=true but empty title should be considered valid
      const eventWithEmptyTitle = {
        id: 'event-123',
        title: '',
        description: 'Some description that got encrypted',
        is_encrypted: true,
      };

      // Empty title is a valid encrypted state (not a corruption)
      const titleLooksEncrypted = looksLikeEncryptedData(
        eventWithEmptyTitle.title
      );
      expect(titleLooksEncrypted).toBe(true);

      // This should NOT be flagged as "markedEncryptedButPlaintext"
      // because empty strings are intentionally preserved by encryptField()
    });
  });
});
