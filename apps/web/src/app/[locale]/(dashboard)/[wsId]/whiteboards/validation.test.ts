import { describe, expect, it } from 'vitest';
import {
  getWhiteboardDescriptionValidationError,
  getWhiteboardMutationErrorKey,
  getWhiteboardTitleValidationError,
  normalizeWhiteboardDescription,
  normalizeWhiteboardTitle,
  WHITEBOARD_DESCRIPTION_MAX_LENGTH,
  WHITEBOARD_TITLE_MAX_LENGTH,
} from './validation';

describe('whiteboard validation', () => {
  it('normalizes title and description input', () => {
    expect(normalizeWhiteboardTitle('  Board  ')).toBe('Board');
    expect(normalizeWhiteboardDescription('  Notes  ')).toBe('Notes');
    expect(normalizeWhiteboardDescription('   ')).toBeNull();
  });

  it('validates empty or oversized titles', () => {
    expect(getWhiteboardTitleValidationError('   ')).toBe(
      'whiteboard_title_required'
    );
    expect(
      getWhiteboardTitleValidationError(
        'a'.repeat(WHITEBOARD_TITLE_MAX_LENGTH + 1)
      )
    ).toBe('whiteboard_title_too_long');
  });

  it('validates oversized descriptions and repeated-character bombs', () => {
    expect(
      getWhiteboardDescriptionValidationError(
        'a'.repeat(WHITEBOARD_DESCRIPTION_MAX_LENGTH + 1)
      )
    ).toBe('whiteboard_description_too_long');
    expect(getWhiteboardTitleValidationError('x'.repeat(33))).toBe(
      'whiteboard_text_bomb_error'
    );
  });

  it('maps database validation failures back to user-facing keys', () => {
    expect(
      getWhiteboardMutationErrorKey(
        'new row for relation violates check constraint "workspace_whiteboards_title_length_check"'
      )
    ).toBe('whiteboard_title_too_long');
    expect(
      getWhiteboardMutationErrorKey('WHITEBOARD_CREATE_RATE_LIMIT_EXCEEDED')
    ).toBe('whiteboard_create_rate_limited');
  });
});
