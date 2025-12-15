import { beforeEach, describe, expect, it } from 'vitest';
import {
  decryptCalendarEventFields,
  decryptCalendarEvents,
  encryptCalendarEventFields,
  encryptCalendarEvents,
} from '../encryption-service';
import type { CalendarEventWithEncryption } from '../types';
import { generateWorkspaceKey } from './test-helpers';

describe('encryption-service', () => {
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

      it('should handle events with null fields and return normalized values', () => {
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

        // Call decryptCalendarEvents and capture result
        const result = decryptCalendarEvents(
          events as unknown as CalendarEventWithEncryption[],
          workspaceKey
        );

        // Verify the result is an array with one event
        expect(result).toHaveLength(1);

        const decryptedEvent = result[0]!;

        // Non-sensitive fields should remain unchanged
        expect(decryptedEvent.id).toBe('event-1');
        expect(decryptedEvent.start_at).toBe('2024-01-01T10:00:00Z');
        expect(decryptedEvent.end_at).toBe('2024-01-01T11:00:00Z');
        expect(decryptedEvent.color).toBe('blue');
        expect(decryptedEvent.ws_id).toBe('ws-123');

        // Null fields get normalized to empty strings by decryptField
        expect(decryptedEvent.title).toBe('');
        expect(decryptedEvent.description).toBe('');
        expect(decryptedEvent.location).toBeUndefined(); // null location becomes undefined
      });

      describe('negative tests and degradations', () => {
        it('should return original ciphertext when decryption fails due to incorrect key', () => {
          const events = [
            { title: 'Secret', description: 'Desc', location: 'Loc' },
          ];
          const encrypted = encryptCalendarEvents(events, workspaceKey);

          // Use a different key
          const wrongKey = generateWorkspaceKey();

          // Add metadata
          const eventsWithMetadata = encrypted.map((e) => ({
            ...e,
            id: '1',
            ws_id: 'ws',
            start_at: '2024-01-01T10:00:00Z',
            end_at: '2024-01-01T11:00:00Z',
            color: 'blue' as const,
          }));

          const result = decryptCalendarEvents(eventsWithMetadata, wrongKey);

          // Should contain ciphertext (not decrypted, not empty)
          // The service returns the original ciphertext on failure check
          expect(result[0]!.title).toBe(encrypted[0]!.title);
          expect(result[0]!.title).not.toBe('Secret');
        });

        it('should handle corrupted encrypted fields gracefully', () => {
          const events = [{ title: 'Secret', description: 'Desc' }];
          const encrypted = encryptCalendarEvents(events, workspaceKey);

          // Corrupt the title
          // We modify the middle of the string to invalidate the auth tag or ciphertext
          const originalTitleCipher = encrypted[0]!.title!;
          // Ensure we have enough length to splice. Base64 is usually long enough.
          const corruptedTitle =
            originalTitleCipher.substring(0, 10) +
            (originalTitleCipher.charAt(10) === 'A' ? 'B' : 'A') +
            originalTitleCipher.substring(11);

          const eventsWithMetadata = [
            {
              ...encrypted[0],
              title: corruptedTitle,
              id: '1',
              ws_id: 'ws',
              start_at: '2024-01-01T10:00:00Z',
              end_at: '2024-01-01T11:00:00Z',
              color: 'blue' as const,
              location: undefined,
            },
          ];

          const result = decryptCalendarEvents(
            eventsWithMetadata as unknown as CalendarEventWithEncryption[],
            workspaceKey
          );

          // Should return the corrupted string (fallback)
          expect(result[0]!.title).toBe(corruptedTitle);
        });

        it('should correct invalid input formats even if marked encrypted', () => {
          const events = [
            {
              id: '1',
              ws_id: 'ws',
              start_at: '2024-01-01T10:00:00Z',
              end_at: '2024-01-01T11:00:00Z',
              color: 'blue' as const,
              title: 'too-short', // Short string, not valid encrypted format
              description: 'not-base-64-!!', // Likely fails invalid length or decode
              location: null,
              is_encrypted: true,
            } as unknown as CalendarEventWithEncryption,
          ];

          const result = decryptCalendarEvents(events, workspaceKey);
          // Short string returns as is because length check fails
          expect(result[0]!.title).toBe('too-short');
        });
      });
    });
  });
});
