import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type ChatResourceAccess = 'allowed' | 'forbidden' | 'lookup_failed';

/**
 * Chat attachments are private to the chat creator. A chat id that does not
 * exist yet is allowed so clients can attach files before the first message
 * creates the chat with that id; an existing chat must belong to the caller.
 */
export async function resolveAiChatResourceAccess(
  sbAdmin: TypedSupabaseClient,
  chatId: string,
  userId: string
): Promise<ChatResourceAccess> {
  const { data, error } = await sbAdmin
    .from('ai_chats')
    .select('creator_id')
    .eq('id', chatId)
    .maybeSingle();

  if (error) return 'lookup_failed';
  if (!data) return 'allowed';
  return data.creator_id === userId ? 'allowed' : 'forbidden';
}

/**
 * Resolves who owns a `{wsId}/chats/ai/resources/...` path: either a temp
 * folder (`temp/{userId}/...`) or a chat folder (`{chatId}/...`).
 */
export function parseAiChatResourcePath(
  wsId: string,
  path: string
): { kind: 'temp'; userId: string } | { kind: 'chat'; chatId: string } | null {
  const prefix = `${wsId}/chats/ai/resources/`;
  if (!path.startsWith(prefix)) return null;
  const segments = path.slice(prefix.length).split('/');
  if (segments[0] === 'temp') {
    return segments.length >= 3 && segments[1] && segments[2]
      ? { kind: 'temp', userId: segments[1] }
      : null;
  }
  return segments.length >= 2 && segments[0] && segments[1]
    ? { kind: 'chat', chatId: segments[0] }
    : null;
}
