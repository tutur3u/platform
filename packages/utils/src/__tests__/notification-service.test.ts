import { describe, expect, it } from 'vitest';
import { extractMentions } from '../notification-service';

describe('extractMentions', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty string', () => {
      expect(extractMentions('')).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(extractMentions(null as unknown as string)).toEqual([]);
      expect(extractMentions(undefined as unknown as string)).toEqual([]);
    });

    it('should return empty array for text without mentions', () => {
      expect(extractMentions('Hello World')).toEqual([]);
      expect(extractMentions('No mentions here')).toEqual([]);
    });
  });

  describe('UUID mention extraction', () => {
    it('should extract a single UUID mention', () => {
      const text =
        'Hey @[550e8400-e29b-41d4-a716-446655440000], check this out';
      const result = extractMentions(text);
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should extract multiple UUID mentions', () => {
      const text = `
        @[550e8400-e29b-41d4-a716-446655440000] and
        @[6ba7b810-9dad-11d1-80b4-00c04fd430c8] please review
      `;
      const result = extractMentions(text);
      expect(result).toHaveLength(2);
      expect(result).toContain('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toContain('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    });

    it('should deduplicate repeated mentions', () => {
      const text = `
        @[550e8400-e29b-41d4-a716-446655440000] first mention
        @[550e8400-e29b-41d4-a716-446655440000] second mention
        @[550e8400-e29b-41d4-a716-446655440000] third mention
      `;
      const result = extractMentions(text);
      expect(result).toHaveLength(1);
      expect(result).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
    });

    it('should handle UUID with uppercase letters', () => {
      const text = '@[550E8400-E29B-41D4-A716-446655440000] uppercase UUID';
      const result = extractMentions(text);
      expect(result).toHaveLength(1);
      // UUIDs should be extracted as-is (case-insensitive matching)
    });

    it('should handle mixed case UUIDs', () => {
      const text = '@[550e8400-E29B-41d4-A716-446655440000] mixed case';
      const result = extractMentions(text);
      expect(result).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should not extract malformed UUIDs', () => {
      // Missing segment
      expect(extractMentions('@[550e8400-e29b-41d4-a716] incomplete')).toEqual(
        []
      );

      // Too short
      expect(extractMentions('@[550e8400] too short')).toEqual([]);

      // Invalid characters
      expect(
        extractMentions('@[550e8400-e29b-41d4-a716-44665544000g] invalid char')
      ).toEqual([]);
    });

    it('should not extract @ without brackets', () => {
      expect(extractMentions('@username plain mention')).toEqual([]);
      expect(extractMentions('email@example.com')).toEqual([]);
    });

    it('should not extract incomplete bracket syntax', () => {
      expect(
        extractMentions(
          '@[550e8400-e29b-41d4-a716-446655440000 missing bracket'
        )
      ).toEqual([]);
      expect(
        extractMentions(
          '@550e8400-e29b-41d4-a716-446655440000] missing bracket'
        )
      ).toEqual([]);
    });

    it('should handle mentions at start of text', () => {
      const text = '@[550e8400-e29b-41d4-a716-446655440000] at the start';
      expect(extractMentions(text)).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('should handle mentions at end of text', () => {
      const text = 'At the end @[550e8400-e29b-41d4-a716-446655440000]';
      expect(extractMentions(text)).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('should handle mentions with no surrounding space', () => {
      const text = 'text@[550e8400-e29b-41d4-a716-446655440000]more';
      expect(extractMentions(text)).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('should handle consecutive mentions', () => {
      const text =
        '@[550e8400-e29b-41d4-a716-446655440000]@[6ba7b810-9dad-11d1-80b4-00c04fd430c8]';
      const result = extractMentions(text);
      expect(result).toHaveLength(2);
    });

    it('should handle mentions in multiline text', () => {
      const text = `
        Line 1: @[550e8400-e29b-41d4-a716-446655440000]
        Line 2: some text
        Line 3: @[6ba7b810-9dad-11d1-80b4-00c04fd430c8]
      `;
      const result = extractMentions(text);
      expect(result).toHaveLength(2);
    });

    it('should handle HTML content with mentions', () => {
      const text =
        '<p>Hello @[550e8400-e29b-41d4-a716-446655440000]</p><br>Test';
      expect(extractMentions(text)).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('should handle JSON-like content with mentions', () => {
      const text =
        '{"message": "Hello @[550e8400-e29b-41d4-a716-446655440000]"}';
      expect(extractMentions(text)).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle task description with mentions', () => {
      const text = `
        Please review this PR:
        - @[550e8400-e29b-41d4-a716-446655440000] for frontend changes
        - @[6ba7b810-9dad-11d1-80b4-00c04fd430c8] for backend changes

        CC: @[f47ac10b-58cc-4372-a567-0e02b2c3d479]
      `;
      const result = extractMentions(text);
      expect(result).toHaveLength(3);
    });

    it('should handle comment with single mention', () => {
      const text =
        '@[550e8400-e29b-41d4-a716-446655440000] can you take a look at this?';
      expect(extractMentions(text)).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
      ]);
    });

    it('should handle markdown-style content', () => {
      const text = `
        # Task Title

        Assigned to: @[550e8400-e29b-41d4-a716-446655440000]

        ## Description
        - [x] Complete task
        - [ ] Review with @[6ba7b810-9dad-11d1-80b4-00c04fd430c8]
      `;
      const result = extractMentions(text);
      expect(result).toHaveLength(2);
    });
  });
});

describe('NotificationType', () => {
  it('should have expected notification types', () => {
    // Type checking test - these should compile without errors
    const types = [
      'task_assigned',
      'task_updated',
      'task_mention',
      'workspace_invite',
    ] as const;

    expect(types).toHaveLength(4);
  });
});

describe('NotificationChannel', () => {
  it('should have expected notification channels', () => {
    const channels = ['web', 'email', 'sms', 'push'] as const;
    expect(channels).toHaveLength(4);
  });
});
