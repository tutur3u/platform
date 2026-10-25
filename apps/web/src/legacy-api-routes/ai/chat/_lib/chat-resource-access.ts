import { createAdminClient } from '@tuturuuu/supabase/next/server';

export type AiChatResourceAccess = 'allowed' | 'not_found' | 'lookup_failed';

export type AiChatResourceScope =
  | { kind: 'chat'; chatId: string; wsId: string }
  | { kind: 'temp'; userId: string; wsId: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Mira chat resources live under `{wsId}/chats/ai/resources/{chatId}/...` or
 * `{wsId}/chats/ai/resources/temp/{userId}/...`. Workspace membership alone
 * does not grant access: another member's chat folder stays private.
 */
export function parseAiChatResourcePath(
  path: string
): AiChatResourceScope | null {
  if (path.includes('..') || path.includes('//')) return null;
  const [wsId, chats, ai, resources, owner, ...rest] = path.split('/');
  if (!wsId || chats !== 'chats' || ai !== 'ai' || resources !== 'resources') {
    return null;
  }
  if (owner === 'temp') {
    const [userId, ...file] = rest;
    if (!userId || file.length === 0 || file.some((part) => !part)) {
      return null;
    }
    return { kind: 'temp', userId, wsId };
  }
  if (!owner || !UUID_PATTERN.test(owner)) return null;
  if (rest.length === 0 || rest.some((part) => !part)) return null;
  return { kind: 'chat', chatId: owner, wsId };
}

/**
 * Only the creator may read or write an existing Mira chat's resource folder.
 * Ids without an `ai_chats` row stay usable: Mind threads share this storage
 * layout, and clients upload before a client-generated chat id is persisted.
 */
export async function verifyAiChatOwner({
  chatId,
  userId,
}: {
  chatId: string;
  userId: string;
}): Promise<AiChatResourceAccess> {
  // Creator-only RLS would hide another member's chat from the request client
  // and make it read as missing, so ownership is checked with the admin client.
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin
    .from('ai_chats')
    .select('id, creator_id')
    .eq('id', chatId)
    .maybeSingle();
  if (error) return 'lookup_failed';
  if (data && data.creator_id !== userId) return 'not_found';
  return 'allowed';
}

export async function verifyAiChatResourceScopes({
  scopes,
  userId,
}: {
  scopes: AiChatResourceScope[];
  userId: string;
}): Promise<AiChatResourceAccess> {
  const chatIds = new Set<string>();
  for (const scope of scopes) {
    if (scope.kind === 'temp') {
      if (scope.userId !== userId) return 'not_found';
      continue;
    }
    chatIds.add(scope.chatId);
  }
  for (const chatId of chatIds) {
    const access = await verifyAiChatOwner({ chatId, userId });
    if (access !== 'allowed') return access;
  }
  return 'allowed';
}
