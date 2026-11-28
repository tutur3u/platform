import 'server-only';

import { callPrivateChatRpc } from '@/lib/chat/private-rpc';

export interface ChatBlockedUser {
  avatarUrl: string | null;
  createdAt: string;
  displayName: string | null;
  userId: string;
}

export const CHAT_REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'impersonation',
  'self_harm',
  'harmful',
  'inaccurate',
  'other',
] as const;

export async function listChatBlockedUsers(actorUserId: string) {
  const blocks = await callPrivateChatRpc<ChatBlockedUser[] | null>(
    'chat_list_blocked_users',
    { p_actor_user_id: actorUserId }
  );
  return Array.isArray(blocks) ? blocks : [];
}

/**
 * The people who blocked [userId]; their pushes for [userId]'s messages are
 * skipped. Throws when the lookup fails.
 */
export async function getChatBlockerUserIds(userId: string) {
  const blockers = await callPrivateChatRpc<string[] | null>(
    'chat_list_blocker_user_ids',
    { p_user_id: userId }
  );
  return new Set(Array.isArray(blockers) ? blockers : []);
}

/**
 * The people [actorUserId] blocked. Read paths use it to hide their content
 * from the actor; sending and inviting are refused in SQL for both sides.
 * A failed lookup throws, so a read never silently shows blocked content.
 */
export async function getChatBlockedUserIds(actorUserId: string) {
  const blocks = await listChatBlockedUsers(actorUserId);
  return new Set(blocks.map((block) => block.userId));
}

type WithSender = {
  sender?: { id?: string | null } | null;
  senderId?: string | null;
};

function senderIdOf(value: WithSender) {
  return value.senderId ?? value.sender?.id ?? null;
}

type WithReactions = {
  reactions?: { count: number; emoji: string; userIds: string[] }[] | null;
};

type WithPreview = {
  latestMessage?: (WithSender & WithReactions) | null;
};

/**
 * Drops a conversation's last-message preview when a blocked person sent it,
 * and hides blocked reactors on a preview that stays.
 */
export function hideBlockedPreviews<T extends WithPreview>(
  conversations: T[],
  blocked: Set<string>
) {
  if (blocked.size === 0) return conversations;
  return conversations.map((conversation) => {
    const latest = conversation.latestMessage;
    if (!latest) return conversation;
    const senderId = senderIdOf(latest);
    return {
      ...conversation,
      latestMessage:
        senderId && blocked.has(senderId)
          ? null
          : hideBlockedReactors(latest, blocked),
    };
  });
}

export function filterBlockedSenders<T extends WithSender>(
  items: T[],
  blocked: Set<string>
) {
  if (blocked.size === 0) return items;
  return items.filter((item) => {
    const senderId = senderIdOf(item);
    return !senderId || !blocked.has(senderId);
  });
}

/**
 * Removes people the reader blocked from a message's reaction summaries and
 * drops summaries left with no visible reactor.
 */
export function hideBlockedReactors<T extends WithReactions>(
  message: T,
  blocked: Set<string>
): T {
  if (blocked.size === 0 || !Array.isArray(message.reactions)) return message;
  const reactions = message.reactions.flatMap((reaction) => {
    const userIds = reaction.userIds.filter((id) => !blocked.has(id));
    const hidden = reaction.userIds.length - userIds.length;
    if (hidden === 0) return [reaction];
    const count = Math.max(0, reaction.count - hidden);
    return count > 0 ? [{ ...reaction, count, userIds }] : [];
  });
  return { ...message, reactions };
}

/**
 * Read-path filter for message lists: drops messages a blocked person sent
 * and hides blocked people from the reactions on the rest.
 */
export function hideBlockedMessageContent<T extends WithSender & WithReactions>(
  messages: T[],
  blocked: Set<string>
) {
  if (blocked.size === 0) return messages;
  return filterBlockedSenders(messages, blocked).map((message) =>
    hideBlockedReactors(message, blocked)
  );
}

/**
 * Block lookup for a write's response. It starts beside the write and settles
 * to null instead of throwing, so a committed write still answers.
 */
export function loadChatBlockedUserIdsForWrite(actorUserId: string) {
  return getChatBlockedUserIds(actorUserId).catch((error: unknown) => {
    console.warn('Chat block lookup failed for a write response', {
      code: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  });
}

/**
 * Hides a blocked sender's last-message preview on a conversation a write
 * returned. Without a block list it drops the preview, so a failed lookup
 * never shows blocked content and the committed write still answers.
 */
export function hideBlockedPreviewAfterWrite<T extends object>(
  conversation: T,
  blocked: Set<string> | null
): T {
  const preview = conversation as T & WithPreview;
  if (!preview.latestMessage) return conversation;
  if (!blocked) return { ...conversation, latestMessage: null };
  const [visible] = hideBlockedPreviews([preview], blocked);
  return visible ?? conversation;
}

/**
 * Hides blocked reactors on a message a write returned. Without a block list
 * it returns no reactions, so a failed lookup never shows a blocked reactor.
 */
export function hideBlockedReactorsAfterWrite<T extends WithReactions>(
  message: T,
  blocked: Set<string> | null
): T {
  if (blocked) return hideBlockedReactors(message, blocked);
  return Array.isArray(message.reactions)
    ? { ...message, reactions: [] }
    : message;
}
