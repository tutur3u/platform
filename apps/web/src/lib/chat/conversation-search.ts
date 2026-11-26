import type { ChatConversation } from './private-rpc';

/** Queries shorter than this list nothing, matching web's message search. */
export const CHAT_CONVERSATION_SEARCH_MIN_LENGTH = 2;
export const CHAT_CONVERSATION_SEARCH_MAX_LENGTH = 100;

/**
 * Case- and accent-insensitive form of a name or query, so "linh" finds
 * "Lĩnh" and "dung" finds "Dũng". Vietnamese "đ" has no decomposition and
 * is folded explicitly.
 */
export function normalizeChatSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}

/**
 * Whether [conversation] matches [query] by its title or by another
 * member's display name or handle. The viewer's own name never matches,
 * since it would match every conversation they belong to. [query] must be
 * normalized with {@link normalizeChatSearchText}.
 */
export function matchesChatConversationQuery(
  conversation: Pick<ChatConversation, 'members' | 'title'>,
  query: string,
  actorUserId: string
) {
  if (!query) return false;
  const candidates = [
    conversation.title,
    ...conversation.members.flatMap((member) =>
      member.userId === actorUserId
        ? []
        : [member.user?.displayName, member.user?.handle]
    ),
  ];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'string' &&
      normalizeChatSearchText(candidate).includes(query)
  );
}

export type ChatConversationSearchQuery =
  | { ok: true; query: string | null }
  | { code: string; message: string; ok: false };

/** Reads the `q` parameter: absent or blank lists without searching. */
export function readChatConversationSearchQuery(
  url: URL
): ChatConversationSearchQuery {
  const raw = url.searchParams.get('q');
  if (raw === null || raw.trim() === '') return { ok: true, query: null };
  if (raw.length > CHAT_CONVERSATION_SEARCH_MAX_LENGTH) {
    return {
      code: 'chat_search_query_too_long',
      message: 'Search query is too long.',
      ok: false,
    };
  }
  const query = normalizeChatSearchText(raw);
  if (query.length < CHAT_CONVERSATION_SEARCH_MIN_LENGTH) {
    return {
      code: 'chat_search_query_too_short',
      message: 'Search query is too short.',
      ok: false,
    };
  }
  return { ok: true, query };
}
