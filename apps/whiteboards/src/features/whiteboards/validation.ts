export const WHITEBOARD_TITLE_MAX_LENGTH = 120;
export const WHITEBOARD_DESCRIPTION_MAX_LENGTH = 500;
export const WHITEBOARD_MAX_REPEATED_CHAR_RUN = 32;

const REPEATED_CHARACTER_RUN_PATTERN = /(.)\1{32,}/u;

export type WhiteboardValidationErrorKey =
  | 'whiteboard_title_required'
  | 'whiteboard_title_too_long'
  | 'whiteboard_description_too_long'
  | 'whiteboard_text_bomb_error'
  | 'whiteboard_create_rate_limited';

export function normalizeWhiteboardTitle(value: string): string {
  return value.trim();
}

export function normalizeWhiteboardDescription(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function hasWhiteboardRepeatedCharacterRun(value: string): boolean {
  return REPEATED_CHARACTER_RUN_PATTERN.test(value);
}

export function getWhiteboardTitleValidationError(
  value: string
): WhiteboardValidationErrorKey | null {
  const normalized = normalizeWhiteboardTitle(value);

  if (!normalized) {
    return 'whiteboard_title_required';
  }

  if (normalized.length > WHITEBOARD_TITLE_MAX_LENGTH) {
    return 'whiteboard_title_too_long';
  }

  if (hasWhiteboardRepeatedCharacterRun(normalized)) {
    return 'whiteboard_text_bomb_error';
  }

  return null;
}

export function getWhiteboardDescriptionValidationError(
  value: string | null | undefined
): WhiteboardValidationErrorKey | null {
  const normalized = normalizeWhiteboardDescription(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length > WHITEBOARD_DESCRIPTION_MAX_LENGTH) {
    return 'whiteboard_description_too_long';
  }

  if (hasWhiteboardRepeatedCharacterRun(normalized)) {
    return 'whiteboard_text_bomb_error';
  }

  return null;
}

export function getWhiteboardMutationErrorKey(
  error: { message?: string | null; details?: string | null } | Error | string
): WhiteboardValidationErrorKey | null {
  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : [error.message, error.details].filter(Boolean).join(' ');

  if (!rawMessage) {
    return null;
  }

  if (rawMessage.includes('WHITEBOARD_CREATE_RATE_LIMIT_EXCEEDED')) {
    return 'whiteboard_create_rate_limited';
  }

  if (
    rawMessage.includes('workspace_whiteboards_title_not_empty_check') ||
    rawMessage.includes('workspace_whiteboards_title_trimmed_check')
  ) {
    return 'whiteboard_title_required';
  }

  if (rawMessage.includes('workspace_whiteboards_title_length_check')) {
    return 'whiteboard_title_too_long';
  }

  if (
    rawMessage.includes('workspace_whiteboards_title_repeated_run_check') ||
    rawMessage.includes('workspace_whiteboards_description_repeated_run_check')
  ) {
    return 'whiteboard_text_bomb_error';
  }

  if (rawMessage.includes('workspace_whiteboards_description_length_check')) {
    return 'whiteboard_description_too_long';
  }

  return null;
}
