import 'server-only';

import {
  CHAT_REALTIME_EVENT_WINDOW_MS,
  type ChatRealtimeAudience,
  type ChatRealtimeEvent,
} from '@tuturuuu/realtime/chat';
import { CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS } from '@tuturuuu/realtime/chat/ticket';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { z } from 'zod';
import {
  isChatRealtimeWorkerReady,
  publishChatRealtimeWorkerEvent,
} from './realtime-worker';

const SLOT_MS = 5 * 60_000;
const RETRY_SLOTS = 2;
const BATCH_SIZE = 32;
const CONCURRENCY = 4;
const QUERY_TIMEOUT_MS = 3_000;
export const CHAT_REALTIME_RECOVERY_DEADLINE_MS = 20_000;
const WORKER_DELIVERY_MARGIN_MS =
  2_000 + 1_000 * CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS;
const ARCHIVE_AUDIENCE_LIMIT = 1_500;
const ARCHIVE_MEMBER_PAGE_SIZE = 1_000;
const AUDIT_COLUMNS =
  'id, actor_id, conversation_id, created_at, metadata, chat_conversations!inner(ws_id)';

const auditRow = z.object({
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

type AuditRow = z.infer<typeof auditRow>;

function toRealtimeEvent(
  row: AuditRow,
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

async function recoverArchiveAudience(
  client: Awaited<ReturnType<typeof createAdminClient<Database>>>,
  row: AuditRow,
  signal: AbortSignal
): Promise<ChatRealtimeAudience | undefined> {
  if (row.metadata.mode !== 'archived' || !row.actor_id) return undefined;
  const userIds = new Set([row.actor_id]);
  for (
    let offset = 0;
    offset < ARCHIVE_AUDIENCE_LIMIT;
    offset += ARCHIVE_MEMBER_PAGE_SIZE
  ) {
    signal.throwIfAborted();
    const size = Math.min(
      ARCHIVE_MEMBER_PAGE_SIZE,
      ARCHIVE_AUDIENCE_LIMIT - offset
    );
    const { data, error } = await client
      .schema('private')
      .from('chat_conversation_members')
      .select('user_id')
      .eq('conversation_id', row.conversation_id)
      .eq('archived_at', row.created_at)
      .order('user_id')
      .range(offset, offset + size - 1)
      .abortSignal(
        AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)])
      );
    if (error) throw error;
    for (const member of data ?? []) userIds.add(member.user_id);
    if ((data?.length ?? 0) < size) break;
  }
  return { scope: 'users', userIds: [...userIds] };
}

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
      .select(AUDIT_COLUMNS)
      .eq('ws_id', input.wsId)
      .eq('actor_id', input.actorUserId)
      .eq('conversation_id', input.conversationId)
      .eq('event_type', 'conversation.deleted')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
    if (error) throw error;

    const latest = auditRow.parse(data?.[0]);
    await publishChatRealtimeWorkerEvent(
      toRealtimeEvent(latest, input.audience)
    );
  } catch (error) {
    console.error('Chat realtime revocation deferred to recovery', {
      conversationId: input.conversationId,
      error,
      wsId: input.wsId,
    });
  }
}

export async function retryChatRealtimeRevocations(
  now: number,
  signal: AbortSignal
) {
  if (!(await isChatRealtimeWorkerReady(signal))) {
    return { capped: false, delivered: 0, failed: 0, skipped: true };
  }

  const slot = Math.floor(now / SLOT_MS) * SLOT_MS;
  const lowerBound = new Date(
    Math.max(
      slot - RETRY_SLOTS * SLOT_MS,
      now -
        CHAT_REALTIME_EVENT_WINDOW_MS +
        CHAT_REALTIME_RECOVERY_DEADLINE_MS +
        WORKER_DELIVERY_MARGIN_MS
    )
  ).toISOString();
  const upperBound = new Date(slot).toISOString();
  const client = await createAdminClient({ noCookie: true });
  const { data, error } = await client
    .schema('private')
    .from('chat_audit_events')
    .select(AUDIT_COLUMNS)
    .eq('event_type', 'conversation.deleted')
    .gte('created_at', lowerBound)
    .lt('created_at', upperBound)
    .order('created_at')
    .order('id')
    .limit(BATCH_SIZE + 1)
    .abortSignal(
      AbortSignal.any([signal, AbortSignal.timeout(QUERY_TIMEOUT_MS)])
    );
  if (error) throw error;

  const rows = data ?? [];
  let delivered = 0;
  let failed = 0;
  for (
    let start = 0;
    start < Math.min(rows.length, BATCH_SIZE);
    start += CONCURRENCY
  ) {
    signal.throwIfAborted();
    const results = await Promise.allSettled(
      rows
        .slice(start, Math.min(start + CONCURRENCY, BATCH_SIZE))
        .map(async (row) => {
          const audit = auditRow.parse(row);
          const audience = await recoverArchiveAudience(client, audit, signal);
          const event = toRealtimeEvent(audit, audience);
          await publishChatRealtimeWorkerEvent(event, signal);
        })
    );
    for (const result of results) {
      if (result.status === 'fulfilled') delivered += 1;
      else failed += 1;
    }
  }
  return {
    capped: rows.length > BATCH_SIZE,
    delivered,
    failed,
    skipped: false,
  };
}
