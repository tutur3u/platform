import type { ChatRealtimeTokenPayload } from '../../../packages/realtime/src/chat';
import { verifyChatRealtimeToken } from '../../../packages/realtime/src/chat/token';

function getChatRealtimeTokenSecret(
  secret = process.env.CHAT_REALTIME_TOKEN_SECRET
) {
  // A dedicated secret only: a Supabase service key must never double as an
  // HMAC key that this sidecar exposes to verification attempts.
  if (secret?.trim()) {
    return secret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Chat realtime token validation requires CHAT_REALTIME_TOKEN_SECRET in production'
    );
  }

  return 'chat-local-development-token-secret';
}

export function verifyChatRealtimeJoinToken(
  token: string,
  secret?: string
): ChatRealtimeTokenPayload | null {
  return verifyChatRealtimeToken(token, getChatRealtimeTokenSecret(secret));
}
