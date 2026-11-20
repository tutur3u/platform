import 'server-only';

import type { ChatRealtimeAudience } from '@tuturuuu/realtime/chat';
import {
  CHAT_REVOCATION_AUDIT_COLUMNS,
  chatRevocationAuditRow,
  toChatRevocationEvent,
} from '@tuturuuu/realtime/chat/revocation';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { publishChatRealtimeWorkerEvent } from './realtime-worker';

const QUERY_TIMEOUT_MS = 3_000;

export async function publishLatestChatRevocation(input: {
  actorUserId: string;
  audience: ChatRealtimeAudience;
  conversationId: string;
  wsId: string;
}) {
  try {
    const client = await createAdminClient({ noCookie: true });
    const { data, error } = await client
      .schema('private')
      .from('chat_audit_events')
      .select(CHAT_REVOCATION_AUDIT_COLUMNS)
      .eq('ws_id', input.wsId)
      .eq('actor_id', input.actorUserId)
      .eq('conversation_id', input.conversationId)
      .eq('event_type', 'conversation.deleted')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
    if (error) throw error;

    const latest = chatRevocationAuditRow.parse(data?.[0]);
    await publishChatRealtimeWorkerEvent(
      toChatRevocationEvent(latest, input.audience)
    );
  } catch (error) {
    console.error('Chat realtime revocation deferred to recovery', {
      conversationId: input.conversationId,
      error,
      wsId: input.wsId,
    });
  }
}
