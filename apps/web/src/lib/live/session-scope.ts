export const MIRA_LIVE_SCOPE_KEY = 'mira:default';
export const WEB_ASSISTANT_LIVE_SCOPE_KEY = 'assistant:web-dashboard';
export const LIVE_SESSION_SCOPE_KEY_MAX_LENGTH = 80;
export const LIVE_SESSION_HANDLE_MAX_LENGTH = 8192;

const ASSISTANT_CHAT_SCOPE_PREFIX = 'assistant:';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const fixedLiveSessionScopeKeys = new Set([
  MIRA_LIVE_SCOPE_KEY,
  WEB_ASSISTANT_LIVE_SCOPE_KEY,
]);

export type LiveSessionScopeValidation =
  | { chatId: string; kind: 'assistant-chat'; scopeKey: string; valid: true }
  | { kind: 'fixed'; scopeKey: string; valid: true }
  | { reason: 'invalid_format' | 'invalid_type' | 'too_long'; valid: false };

export function assistantChatScopeKey(chatId: string) {
  return `assistant:${chatId}`;
}

export function validateLiveSessionScopeKey(
  scopeKey: unknown
): LiveSessionScopeValidation {
  if (typeof scopeKey !== 'string' || scopeKey.length === 0) {
    return { reason: 'invalid_type', valid: false };
  }

  if (scopeKey.length > LIVE_SESSION_SCOPE_KEY_MAX_LENGTH) {
    return { reason: 'too_long', valid: false };
  }

  if (fixedLiveSessionScopeKeys.has(scopeKey)) {
    return { kind: 'fixed', scopeKey, valid: true };
  }

  if (!scopeKey.startsWith(ASSISTANT_CHAT_SCOPE_PREFIX)) {
    return { reason: 'invalid_format', valid: false };
  }

  const chatId = scopeKey.slice(ASSISTANT_CHAT_SCOPE_PREFIX.length);
  if (!UUID_PATTERN.test(chatId)) {
    return { reason: 'invalid_format', valid: false };
  }

  return { chatId, kind: 'assistant-chat', scopeKey, valid: true };
}

export function isValidLiveSessionHandle(
  sessionHandle: unknown
): sessionHandle is string {
  return (
    typeof sessionHandle === 'string' &&
    sessionHandle.length > 0 &&
    sessionHandle.length <= LIVE_SESSION_HANDLE_MAX_LENGTH
  );
}
