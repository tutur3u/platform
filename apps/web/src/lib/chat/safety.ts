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
