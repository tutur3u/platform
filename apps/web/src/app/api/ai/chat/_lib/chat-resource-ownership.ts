import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { validate as validateUUID } from 'uuid';

export type ChatResourceAccess = 'allowed' | 'forbidden' | 'lookup_failed';

export type ChatUploadFolder = 'chat' | 'temp' | 'forbidden' | 'lookup_failed';

/**
 * Chat attachment folders belong to the `ai_chats` creator, matching the
 * `workspaces` bucket RLS (`chats/ai/resources/<chatId>/**`). No other record
 * (for example a Mind thread) owns a folder here.
 */
async function lookupAiChatCreator(
  sbAdmin: TypedSupabaseClient,
  chatId: string
): Promise<{ found: boolean; creatorId: string | null } | null> {
  const { data, error } = await sbAdmin
    .from('ai_chats')
    .select('creator_id')
    .eq('id', chatId)
    .maybeSingle();

  if (error) return null;
  return { found: !!data, creatorId: data?.creator_id ?? null };
}

/**
 * Deletes require an existing chat the caller created. Folders without a chat
 * (orphans, non-chat ids) are not deletable through this API.
 */
export async function resolveAiChatResourceAccess(
  sbAdmin: TypedSupabaseClient,
  chatId: string,
  userId: string
): Promise<ChatResourceAccess> {
  if (!validateUUID(chatId)) return 'forbidden';

  const chat = await lookupAiChatCreator(sbAdmin, chatId);
  if (!chat) return 'lookup_failed';
  return chat.found && chat.creatorId === userId ? 'allowed' : 'forbidden';
}

/**
 * Where an upload for `chatId` may go. Only a chat the caller created gets its
 * chat folder; another user's chat is forbidden. Any other id (a chat not
 * created yet, or a non-chat record) uploads to the caller's
 * `temp/{userId}` folder, and the AI route moves temp files on first message.
 * Uploads never overwrite (`upsert: false`).
 */
export async function resolveAiChatUploadFolder(
  sbAdmin: TypedSupabaseClient,
  chatId: string,
  userId: string
): Promise<ChatUploadFolder> {
  if (!validateUUID(chatId)) return 'forbidden';

  const chat = await lookupAiChatCreator(sbAdmin, chatId);
  if (!chat) return 'lookup_failed';
  if (!chat.found) return 'temp';
  return chat.creatorId === userId ? 'chat' : 'forbidden';
}

/**
 * Resolves who owns a `{wsId}/chats/ai/resources/...` path: either a temp
 * folder (`temp/{userId}/...`) or a chat folder (`{chatId}/...`, UUID only).
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
  return segments.length >= 2 &&
    segments[0] &&
    validateUUID(segments[0]) &&
    segments[1]
    ? { kind: 'chat', chatId: segments[0] }
    : null;
}
