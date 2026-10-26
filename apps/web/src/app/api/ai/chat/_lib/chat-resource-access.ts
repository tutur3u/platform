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

export type AiChatResourceOwner =
  | { kind: 'ai_chat' }
  | { kind: 'mind_thread' }
  | { kind: 'unknown' };

/**
 * Resolves which record owns a resource folder id and whether the actor owns
 * it. Mira chats (`ai_chats`) have no workspace column, so the creator is the
 * owner; Mind threads (`private.mind_ai_threads`) share the storage layout and
 * must match both creator and the folder's workspace. Ids without either
 * record are `unknown`: readers deny them, and upload-url sends new files to
 * the actor's `temp/{actorId}` folder until an owned record exists.
 */
export async function resolveAiChatResourceOwner({
  chatId,
  userId,
  wsId,
}: {
  chatId: string;
  userId: string;
  wsId: string;
}): Promise<
  | { access: 'allowed'; owner: AiChatResourceOwner }
  | { access: 'not_found' | 'lookup_failed'; owner?: never }
> {
  // Creator-only RLS would hide another member's record and make it read as
  // missing, so ownership is checked with the admin client.
  const admin = await createAdminClient({ noCookie: true });
  const chat = await admin
    .from('ai_chats')
    .select('id, creator_id')
    .eq('id', chatId)
    .maybeSingle();
  if (chat.error) return { access: 'lookup_failed' };
  if (chat.data) {
    return chat.data.creator_id === userId
      ? { access: 'allowed', owner: { kind: 'ai_chat' } }
      : { access: 'not_found' };
  }

  const thread = await admin
    .schema('private')
    .from('mind_ai_threads')
    .select('id, creator_id, ws_id')
    .eq('id', chatId)
    .maybeSingle();
  if (thread.error) return { access: 'lookup_failed' };
  if (thread.data) {
    return thread.data.creator_id === userId && thread.data.ws_id === wsId
      ? { access: 'allowed', owner: { kind: 'mind_thread' } }
      : { access: 'not_found' };
  }

  return { access: 'allowed', owner: { kind: 'unknown' } };
}

/** Readers and deleters require an owned record; unknown owners are denied. */
export async function verifyAiChatOwner({
  chatId,
  userId,
  wsId,
}: {
  chatId: string;
  userId: string;
  wsId: string;
}): Promise<AiChatResourceAccess> {
  const resolved = await resolveAiChatResourceOwner({ chatId, userId, wsId });
  if (resolved.access !== 'allowed') return resolved.access;
  return resolved.owner.kind === 'unknown' ? 'not_found' : 'allowed';
}

export async function verifyAiChatResourceScopes({
  scopes,
  userId,
}: {
  scopes: AiChatResourceScope[];
  userId: string;
}): Promise<AiChatResourceAccess> {
  const chats = new Map<string, AiChatResourceScope & { kind: 'chat' }>();
  for (const scope of scopes) {
    if (scope.kind === 'temp') {
      if (scope.userId !== userId) return 'not_found';
      continue;
    }
    chats.set(`${scope.wsId}/${scope.chatId}`, scope);
  }
  for (const { chatId, wsId } of chats.values()) {
    const access = await verifyAiChatOwner({ chatId, userId, wsId });
    if (access !== 'allowed') return access;
  }
  return 'allowed';
}
