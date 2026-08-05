import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import type { ChatConversation, ChatMessage } from '@/lib/chat/private-rpc';
import type { ExternalChatEventEnvelope } from './schemas';
import { externalChatPrivateDb } from './store';

type ReplayResult = Record<string, unknown> & {
  conversation?: ChatConversation;
  message?: ChatMessage;
};

export async function claimExternalChatSourceEvent({
  connectorKey,
  event,
  wsId,
}: {
  connectorKey: string;
  event: ExternalChatEventEnvelope;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const claimToken = randomUUID();
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_claim_source_event',
    {
      p_claim_token: claimToken,
      p_connector_key: connectorKey,
      p_delivery_mode: event.deliveryMode,
      p_event_kind: event.kind,
      p_occurred_at: event.timestamp,
      p_payload_digest: digestExternalChatEnvelope(event),
      p_source_event_id: event.eventId,
      p_source_record_id: sourceRecordId(event),
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
  return {
    ...(data as {
      result?: ReplayResult;
      status: 'claimed' | 'duplicate' | 'in_progress' | 'payload_mismatch';
    }),
    claimToken,
  };
}

export async function recordExternalChatSourceEvent({
  claimToken,
  connectorKey,
  event,
  result,
  threadId,
  wsId,
}: {
  claimToken: string;
  connectorKey: string;
  event: ExternalChatEventEnvelope;
  result: Record<string, unknown>;
  threadId?: string | null;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_record_source_event',
    {
      p_claim_token: claimToken,
      p_connector_key: connectorKey,
      p_delivery_mode: event.deliveryMode,
      p_event_kind: event.kind,
      p_occurred_at: event.timestamp,
      p_payload_digest: digestExternalChatEnvelope(event),
      p_result: minimizeExternalChatResult(result) as Json,
      p_source_event_id: event.eventId,
      p_source_record_id: sourceRecordId(event),
      // Generated RPC arguments do not encode nullable SQL parameters.
      p_thread_id: (threadId ?? null) as string,
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error('external_chat_source_event_claim_lost');
}

export async function releaseExternalChatSourceEvent({
  claimToken,
  connectorKey,
  event,
  wsId,
}: {
  claimToken: string;
  connectorKey: string;
  event: ExternalChatEventEnvelope;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_release_source_event',
    {
      p_claim_token: claimToken,
      p_connector_key: connectorKey,
      p_payload_digest: digestExternalChatEnvelope(event),
      p_source_event_id: event.eventId,
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
}

export async function hydrateExternalChatReplayResult(
  result: ReplayResult,
  wsId: string
) {
  if (
    typeof result.conversationId !== 'string' ||
    typeof result.messageId !== 'string'
  )
    return result;
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_replay_projection',
    {
      p_conversation_id: result.conversationId,
      p_message_id: result.messageId,
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
  const projection = data as {
    conversation?: ChatConversation;
    message?: ChatMessage;
  } | null;
  return projection ? { ...result, ...projection } : result;
}

export function digestExternalChatEnvelope(event: ExternalChatEventEnvelope) {
  const { deliveryMode: _deliveryMode, ...canonicalEvent } = event;
  return createHash('sha256')
    .update(stableJson(canonicalEvent), 'utf8')
    .digest('hex');
}

export function digestExternalChatBatch(events: ExternalChatEventEnvelope[]) {
  return createHash('sha256')
    .update(
      events
        .map(normalizeExternalChatDigestEvent)
        .map(stableJson)
        .sort()
        .join('\n'),
      'utf8'
    )
    .digest('hex');
}

function normalizeExternalChatDigestEvent(event: ExternalChatEventEnvelope) {
  if (
    event.kind !== 'message' ||
    !event.attachment ||
    Object.keys(event.attachment).length > 0
  ) {
    return event;
  }
  const { attachment: _attachment, ...canonicalEvent } = event;
  return canonicalEvent;
}

function minimizeExternalChatResult(result: Record<string, unknown>) {
  const allowed = [
    'accepted',
    'conversationCreated',
    'conversationId',
    'ephemeral',
    'found',
    'messageId',
    'observationId',
    'threadId',
  ] as const;
  return Object.fromEntries(
    allowed.flatMap((key) =>
      result[key] === undefined ? [] : [[key, result[key]]]
    )
  );
}

function sourceRecordId(event: ExternalChatEventEnvelope) {
  return 'messageId' in event
    ? event.messageId
    : 'observationId' in event
      ? event.observationId
      : event.eventId;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
