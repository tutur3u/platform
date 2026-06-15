import { describe, expect, it } from 'vitest';
import {
  assistantChatScopeKey,
  isValidLiveSessionHandle,
  LIVE_SESSION_HANDLE_MAX_LENGTH,
  MIRA_LIVE_SCOPE_KEY,
  validateLiveSessionScopeKey,
  WEB_ASSISTANT_LIVE_SCOPE_KEY,
} from './session-scope';

const CHAT_ID = '123e4567-e89b-42d3-a456-426614174000';

describe('live session scope validation', () => {
  it('accepts fixed server-minted scope keys', () => {
    expect(validateLiveSessionScopeKey(MIRA_LIVE_SCOPE_KEY)).toEqual({
      kind: 'fixed',
      scopeKey: MIRA_LIVE_SCOPE_KEY,
      valid: true,
    });
    expect(validateLiveSessionScopeKey(WEB_ASSISTANT_LIVE_SCOPE_KEY)).toEqual({
      kind: 'fixed',
      scopeKey: WEB_ASSISTANT_LIVE_SCOPE_KEY,
      valid: true,
    });
  });

  it('accepts assistant chat scopes only when the suffix is a uuid', () => {
    expect(validateLiveSessionScopeKey(assistantChatScopeKey(CHAT_ID))).toEqual(
      {
        chatId: CHAT_ID,
        kind: 'assistant-chat',
        scopeKey: `assistant:${CHAT_ID}`,
        valid: true,
      }
    );

    expect(validateLiveSessionScopeKey('assistant:not-a-uuid')).toEqual({
      reason: 'invalid_format',
      valid: false,
    });
  });

  it('rejects arbitrary or oversized client-selected scope keys', () => {
    expect(validateLiveSessionScopeKey('attacker:1')).toEqual({
      reason: 'invalid_format',
      valid: false,
    });
    expect(validateLiveSessionScopeKey(`assistant:${'a'.repeat(100)}`)).toEqual(
      {
        reason: 'too_long',
        valid: false,
      }
    );
  });

  it('bounds stored session handles', () => {
    expect(isValidLiveSessionHandle('session-handle')).toBe(true);
    expect(isValidLiveSessionHandle('')).toBe(false);
    expect(
      isValidLiveSessionHandle('x'.repeat(LIVE_SESSION_HANDLE_MAX_LENGTH))
    ).toBe(true);
    expect(
      isValidLiveSessionHandle('x'.repeat(LIVE_SESSION_HANDLE_MAX_LENGTH + 1))
    ).toBe(false);
  });
});
