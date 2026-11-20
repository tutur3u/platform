import { z } from 'zod';
import type { ChatRealtimeAudience, ChatRealtimeEvent } from './index';

export const CHAT_REVOCATION_AUDIT_COLUMNS =
  'id, actor_id, conversation_id, created_at, metadata, chat_conversations!inner(ws_id)';

export const chatRevocationAuditRow = z.object({
  actor_id: z.uuid().nullable(),
  chat_conversations: z.object({ ws_id: z.uuid() }),
  conversation_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  metadata: z.object({
    mode: z.enum(['left', 'archived']),
    type: z.enum(['ai', 'channel', 'direct', 'group']),
  }),
});

export type ChatRevocationAuditRow = z.infer<typeof chatRevocationAuditRow>;

export function toChatRevocationEvent(
  row: ChatRevocationAuditRow,
  audience?: ChatRealtimeAudience
): ChatRealtimeEvent {
  const actor = row.actor_id;
  if (!actor) throw new Error('Chat revocation actor unavailable');

  const base = {
    actorUserId: actor,
    audience: audience ?? { scope: 'users' as const, userIds: [actor] },
    conversationId: row.conversation_id,
    id: row.id,
    sentAt: row.created_at,
    wsId: row.chat_conversations.ws_id,
  };
  if (row.metadata.mode === 'left') {
    return { ...base, type: 'member.removed', userId: actor };
  }
  return {
    ...base,
    result: {
      conversationId: row.conversation_id,
      mode: row.metadata.mode,
      type: row.metadata.type,
    },
    type: 'conversation.deleted',
  };
}

export const chatRevocationAuditRows = chatRevocationAuditRow.array();
export const chatArchivedMemberRows = z.array(z.object({ user_id: z.uuid() }));
