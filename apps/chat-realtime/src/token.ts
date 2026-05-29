import type { ChatRealtimeTokenPayload } from '../../../packages/realtime/src/chat';
import { verifyChatRealtimeToken } from '../../../packages/realtime/src/chat/token';

function getChatRealtimeTokenSecret(
  secret = process.env.CHAT_REALTIME_TOKEN_SECRET
) {
  const resolvedSecret =
    secret ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (resolvedSecret?.trim()) {
    return resolvedSecret.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Chat realtime token validation requires CHAT_REALTIME_TOKEN_SECRET or the platform Supabase service secret in production'
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
