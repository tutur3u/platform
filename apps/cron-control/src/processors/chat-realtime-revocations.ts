import { CHAT_REALTIME_EVENT_WINDOW_MS } from '@tuturuuu/realtime/chat';
import { prepareChatRealtimePublish } from '@tuturuuu/realtime/chat/publish';
import {
  CHAT_REVOCATION_AUDIT_COLUMNS,
  type ChatRevocationAuditRow,
  chatArchivedMemberRows,
  chatRevocationAuditRows,
  toChatRevocationEvent,
} from '@tuturuuu/realtime/chat/revocation';
import { CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS } from '@tuturuuu/realtime/chat/ticket';
import { databaseHeaders } from '../database';
import { withinDeadline } from './deadline';
import type { ProcessorContext, ProcessorResult } from './types';

const SLOT_MS = 5 * 60_000;
const BATCH_SIZE = 32;
const MAX_DELIVERED_CURSOR =
  BATCH_SIZE * Math.ceil(CHAT_REALTIME_EVENT_WINDOW_MS / SLOT_MS);
const CONCURRENCY = 4;
const RECOVERY_DEADLINE_MS = 20_000;
const DELIVERY_MARGIN_MS =
  2_000 + CHAT_REALTIME_TICKET_CLOCK_SKEW_SECONDS * 1_000;
const MAX_RESPONSE_BYTES = 128 * 1024;
const ARCHIVE_MEMBER_PAGE_SIZE = 1_000;
const ARCHIVE_AUDIENCE_LIMIT = 1_500;

async function requestJson(
  context: ProcessorContext,
  url: URL,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  const timeout = AbortSignal.timeout(
    Math.max(1, Math.min(timeoutMs, context.deadline - context.now()))
  );
  const signal = context.signal
    ? AbortSignal.any([context.signal, timeout])
    : timeout;
  const response = await withinDeadline(context, () =>
    context.fetch(url, { ...init, redirect: 'error', signal })
  );
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`Chat recovery request returned ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Chat recovery response is empty');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await withinDeadline(context, () =>
        reader.read()
      );
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new Error('Chat recovery response too large');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

async function archiveAudience(
  context: ProcessorContext,
  database: URL,
  row: ChatRevocationAuditRow
) {
  if (row.metadata.mode !== 'archived' || !row.actor_id) return undefined;
  const userIds = new Set([row.actor_id]);
  for (
    let offset = 0;
    offset < ARCHIVE_AUDIENCE_LIMIT;
    offset += ARCHIVE_MEMBER_PAGE_SIZE
  ) {
    if (!(await withinDeadline(context, context.fence))) return null;
    const size = Math.min(
      ARCHIVE_MEMBER_PAGE_SIZE,
      ARCHIVE_AUDIENCE_LIMIT - offset
    );
    const url = new URL('/rest/v1/chat_conversation_members', database);
    url.search = new URLSearchParams({
      select: 'user_id',
      conversation_id: `eq.${row.conversation_id}`,
      archived_at: `eq.${row.created_at}`,
      order: 'user_id.asc',
      offset: String(offset),
      limit: String(size),
    }).toString();
    const rows = chatArchivedMemberRows.parse(
      await requestJson(
        context,
        url,
        { headers: databaseHeaders(context.env) },
        3_000
      )
    );
    if (rows.length > size)
      throw new Error('Chat archive page exceeds its limit');
    for (const member of rows) userIds.add(member.user_id);
    if (rows.length < size) break;
  }
  return { scope: 'users' as const, userIds: [...userIds] };
}

export async function recoverChatRevocations(
  supplied: ProcessorContext
): Promise<ProcessorResult> {
  const now = supplied.now();
  const context = {
    ...supplied,
    deadline: Math.min(supplied.deadline, now + RECOVERY_DEADLINE_MS),
  };
  const detail = { capped: 0, delivered: 0, failed: 0 };
  const fence = () => withinDeadline(context, context.fence);
  if (!(await fence())) return { detail, outcome: 'stopped' };
  const health = await requestJson(
    context,
    new URL('/health', context.target.url),
    {},
    2_000
  );
  if (
    !health ||
    typeof health !== 'object' ||
    !('ok' in health) ||
    health.ok !== true ||
    !('stopped' in health) ||
    typeof health.stopped !== 'boolean'
  ) {
    return { detail, outcome: 'unknown' };
  }
  if (health.stopped || !(await fence())) return { detail, outcome: 'stopped' };

  const database = new URL(context.env.SUPABASE_URL);
  if (
    database.protocol !== 'https:' ||
    database.username ||
    database.password ||
    !context.env.SUPABASE_SECRET_KEY
  ) {
    return { detail, outcome: 'failed' };
  }
  const slot = Math.floor(now / SLOT_MS) * SLOT_MS;
  const lowerBound = new Date(
    now -
      CHAT_REALTIME_EVENT_WINDOW_MS +
      RECOVERY_DEADLINE_MS +
      DELIVERY_MARGIN_MS
  ).toISOString();
  const cursor = (context.chatDeliveredCursor ?? []).filter(
    ({ createdAt }) => Date.parse(createdAt) >= Date.parse(lowerBound)
  );
  const audit = new URL('/rest/v1/chat_audit_events', database);
  audit.search = new URLSearchParams([
    ['select', CHAT_REVOCATION_AUDIT_COLUMNS],
    ['event_type', 'eq.conversation.deleted'],
    ['created_at', `gte.${lowerBound}`],
    ['created_at', `lt.${new Date(slot).toISOString()}`],
    ['order', 'created_at.desc,id.desc'],
    ['limit', String(BATCH_SIZE + 1)],
  ]).toString();
  if (cursor.length)
    audit.searchParams.set(
      'id',
      `not.in.(${cursor.map(({ id }) => id).join(',')})`
    );
  const rows = chatRevocationAuditRows.parse(
    await requestJson(
      context,
      audit,
      { headers: databaseHeaders(context.env) },
      3_000
    )
  );
  if (rows.length > BATCH_SIZE + 1) return { detail, outcome: 'unknown' };
  detail.capped = Number(rows.length > BATCH_SIZE);
  const finish = (outcome: ProcessorResult['outcome']): ProcessorResult => ({
    detail,
    outcome,
    chatDeliveredCursor: cursor.slice(-MAX_DELIVERED_CURSOR),
  });

  for (
    let start = 0;
    start < Math.min(rows.length, BATCH_SIZE);
    start += CONCURRENCY
  ) {
    try {
      if (!(await fence())) return finish('stopped');
    } catch {
      return finish('unknown');
    }
    const results = await Promise.allSettled(
      rows
        .slice(start, Math.min(start + CONCURRENCY, BATCH_SIZE))
        .map(async (row) => {
          const audience = await archiveAudience(context, database, row);
          if (audience === null) return false;
          const event = toChatRevocationEvent(row, audience);
          const publish = await prepareChatRealtimePublish(
            event,
            context.target.secret,
            context.now()
          );
          if (!publish) throw new Error('Chat recovery event is too large');
          if (!(await fence())) return false;
          const response = await requestJson(
            context,
            context.target.url,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${publish.token}`,
                'Content-Type': 'application/json',
              },
              body: publish.body,
            },
            2_000
          );
          if (
            !response ||
            typeof response !== 'object' ||
            !('ok' in response) ||
            response.ok !== true
          )
            throw new Error('Chat recovery publish unconfirmed');
          return { id: row.id, createdAt: row.created_at };
        })
    );
    let stopped = false;
    for (const result of results) {
      if (result.status === 'rejected') detail.failed += 1;
      else if (result.value) {
        detail.delivered += 1;
        cursor.push(result.value);
      } else stopped = true;
    }
    if (stopped) return finish('stopped');
  }
  return finish(detail.failed ? 'failed' : detail.capped ? 'degraded' : 'ok');
}
