import { createHash } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import type { ChatConversation, ChatMessage } from '@/lib/chat/private-rpc';
import { sanitizeExternalChatRecord } from './sanitize';
import {
  type ExternalChatEventEnvelope,
  type ExternalChatSettings,
  externalChatSettingsSchema,
  isExternalChatLiveAuthority,
} from './schemas';

type CredentialRow = {
  configuration_revision: number;
  control_secret_encrypted: string | null;
  control_secret_last_four: string | null;
  control_secret_rotated_at: string | null;
  ingest_secret_hash: string | null;
  ingest_secret_last_four: string | null;
  ingest_secret_rotated_at: string | null;
  verified_at: string | null;
  verified_revision: number | null;
  pending_action: ExternalChatCredentialAction | null;
  pending_secret_encrypted: string | null;
  pending_secret_hash: string | null;
  pending_secret_last_four: string | null;
  pending_created_at: string | null;
  pairing_ticket_consumed_at?: string | null;
};

type BindingRow = {
  canonical_project_id: string | null;
  is_enabled: boolean;
  settings: Json;
};

type AdminClient = SupabaseClient<Database>;
export type ExternalChatCredentialAction =
  | 'clear_control'
  | 'clear_ingest'
  | 'rotate_control'
  | 'set_ingest';

export function externalChatPrivateDb(admin: unknown) {
  return (admin as AdminClient).schema('private');
}

export async function readExternalChatBinding(wsId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const { data: binding, error } = await admin
    .from('workspace_external_project_bindings')
    .select('canonical_project_id, is_enabled, settings')
    .eq('ws_id', wsId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!binding) return null;

  const { data: credentials, error: credentialError } =
    await externalChatPrivateDb(admin)
      .from('external_chat_binding_credentials')
      .select(
        'configuration_revision, control_secret_encrypted, control_secret_last_four, control_secret_rotated_at, ingest_secret_hash, ingest_secret_last_four, ingest_secret_rotated_at, verified_at, verified_revision, pending_action, pending_secret_encrypted, pending_secret_hash, pending_secret_last_four, pending_created_at, pairing_ticket_consumed_at'
      )
      .eq('ws_id', wsId)
      .maybeSingle();
  if (credentialError) throw new Error(credentialError.message);

  return {
    binding: binding as BindingRow,
    credentials: (credentials as CredentialRow | null) ?? null,
  };
}

export async function writeExternalChatSettings(
  wsId: string,
  settings: ExternalChatSettings,
  actorId: string
) {
  const admin = await createAdminClient({ noCookie: true });
  const db = externalChatPrivateDb(admin) as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await db.rpc('external_chat_update_settings', {
    p_actor_user_id: actorId,
    p_chat: settings as Json,
    p_ws_id: wsId,
  });
  if (error) throw new Error(error.message);
}

export async function stageExternalChatCredential(
  wsId: string,
  pending: {
    action: ExternalChatCredentialAction;
    encrypted: string;
    hash: string | null;
    lastFour: string;
  }
) {
  await callExternalChatCredentialRpc('external_chat_stage_credential', {
    p_action: pending.action,
    p_last_four: pending.lastFour,
    p_secret_encrypted: pending.encrypted,
    p_secret_hash: pending.hash,
    p_ws_id: wsId,
  });
}

export async function promoteExternalChatCredential(
  wsId: string,
  action: ExternalChatCredentialAction,
  encrypted: string
) {
  await callExternalChatCredentialRpc('external_chat_promote_credential', {
    p_action: action,
    p_secret_encrypted: encrypted,
    p_ws_id: wsId,
  });
}

export async function markExternalChatCredentialVerified(
  wsId: string,
  controlSecretEncrypted: string,
  configurationRevision: number
) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_mark_verified',
    {
      p_control_secret_encrypted: controlSecretEncrypted,
      p_configuration_revision: configurationRevision,
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
  return data === true;
}

export async function clearExternalChatCredential(
  wsId: string,
  kind: 'control' | 'ingest'
) {
  const admin = await createAdminClient({ noCookie: true });
  const { error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_clear_credential',
    { p_kind: kind, p_ws_id: wsId }
  );
  if (error) throw new Error(error.message);
}

export async function issueExternalChatPairingTicket(
  wsId: string,
  ticketHash: string,
  expiresAt: string
) {
  await callExternalChatCredentialRpc('external_chat_issue_pairing_ticket', {
    p_expires_at: expiresAt,
    p_ticket_hash: ticketHash,
    p_ws_id: wsId,
  });
}

export async function consumeExternalChatPairingTicket(
  wsId: string,
  ticketHash: string
) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_consume_pairing_ticket',
    { p_ticket_hash: ticketHash, p_ws_id: wsId }
  );
  if (error) throw new Error(error.message);
  return data === true;
}

async function callExternalChatCredentialRpc(
  name: string,
  args: Record<string, unknown>
) {
  const admin = await createAdminClient({ noCookie: true });
  const db = externalChatPrivateDb(admin) as unknown as {
    rpc: (
      fn: string,
      values: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
}

export async function importExternalChatEvent({
  configurationRevision,
  connectorKey,
  event,
  mappedUserId,
  wsId,
}: {
  configurationRevision: number;
  connectorKey: string;
  event: Extract<ExternalChatEventEnvelope, { kind: 'message' }>;
  mappedUserId: string | null;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const profileDisplayName =
    readDynamicString(event.visitorProfile.displayName) ??
    readDynamicString(event.visitorProfile.name);
  const messageMetadata = {
    attachment: event.contentType === 2 ? (event.attachment ?? null) : null,
    contentType: event.contentType,
    context: event.context,
    externalChat: true,
    externalDeliveryMode: event.deliveryMode,
    externalSender: {
      direction: event.direction,
      ...(profileDisplayName ? { displayName: profileDisplayName } : {}),
    },
    status: event.status,
  };
  const threadMetadata = {
    ...event.visitorProfile,
    ...(profileDisplayName ? { displayName: profileDisplayName } : {}),
    lastExternalDeliveryMode: event.deliveryMode,
  };
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_import_event',
    {
      p_connector_key: connectorKey,
      p_configuration_revision: configurationRevision,
      p_content: event.content,
      p_direction: event.direction,
      ...(mappedUserId ? { p_mapped_user_id: mappedUserId } : {}),
      p_message_metadata: messageMetadata as Json,
      p_occurred_at: event.timestamp,
      p_remote_agent_id: event.agentId,
      p_remote_message_id: event.messageId,
      p_remote_visitor_id: event.visitorId,
      p_thread_metadata: threadMetadata as Json,
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
  return data as unknown as {
    conversation?: ChatConversation;
    conversationCreated?: boolean;
    conversationId?: string;
    duplicate: boolean;
    message?: ChatMessage;
    messageId: string;
    threadId?: string;
  };
}

export async function applyExternalChatMessageState({
  connectorKey,
  event,
  wsId,
}: {
  connectorKey: string;
  event: Extract<
    ExternalChatEventEnvelope,
    { kind: 'message_deleted' | 'message_state' }
  >;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_apply_message_state' as never,
    {
      p_connector_key: connectorKey,
      p_deleted: event.kind === 'message_deleted',
      p_metadata: sanitizeExternalChatRecord(event.metadata) as Json,
      p_occurred_at: event.timestamp,
      p_remote_message_id: event.messageId,
      p_status: event.status,
      p_ws_id: wsId,
    } as never
  );
  if (error) throw new Error(error.message);
  return data as unknown as {
    found: boolean;
    message?: ChatMessage;
    messageId?: string;
    threadId?: string;
  };
}

export async function upsertExternalChatObservation({
  connectorKey,
  event,
  wsId,
}: {
  connectorKey: string;
  event: Extract<ExternalChatEventEnvelope, { kind: 'observation' }>;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_upsert_observation' as never,
    {
      p_category: event.category,
      p_connector_key: connectorKey,
      p_occurred_at: event.timestamp,
      p_payload: sanitizeExternalChatRecord(event.payload) as Json,
      p_remote_agent_id: event.agentId,
      p_remote_observation_id: event.observationId,
      p_remote_visitor_id: event.visitorId,
      p_ws_id: wsId,
    } as never
  );
  if (error) throw new Error(error.message);
  return data as unknown as {
    found: boolean;
    observationId?: string;
    threadId?: string;
  };
}

export async function readExternalChatSourceEvent({
  connectorKey,
  sourceEventId,
  wsId,
}: {
  connectorKey: string;
  sourceEventId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin)
    .from('external_chat_source_events')
    .select('delivery_mode, payload_digest, result')
    .eq('ws_id', wsId)
    .eq('connector_key', connectorKey)
    .eq('source_event_id', sourceEventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    delivery_mode: 'historical' | 'live' | 'probe';
    payload_digest: string;
    result: Json;
  } | null;
}

export async function recordExternalChatSourceEvent({
  connectorKey,
  event,
  result,
  threadId,
  wsId,
}: {
  connectorKey: string;
  event: ExternalChatEventEnvelope;
  result: Record<string, unknown>;
  threadId?: string | null;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const payloadDigest = digestExternalChatEnvelope(event);
  const db = externalChatPrivateDb(admin) as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await db.rpc('external_chat_record_source_event', {
    p_connector_key: connectorKey,
    p_delivery_mode: event.deliveryMode,
    p_event_kind: event.kind,
    p_occurred_at: event.timestamp,
    p_payload_digest: payloadDigest,
    p_result: result as Json,
    p_source_event_id: event.eventId,
    p_source_record_id:
      'messageId' in event
        ? event.messageId
        : 'observationId' in event
          ? event.observationId
          : event.eventId,
    p_thread_id: threadId ?? null,
    p_ws_id: wsId,
  });
  if (error) throw new Error(error.message);
}

export function digestExternalChatEnvelope(event: ExternalChatEventEnvelope) {
  const { deliveryMode: _deliveryMode, ...canonicalEvent } = event;
  return createHash('sha256')
    .update(stableJson(canonicalEvent), 'utf8')
    .digest('hex');
}

export function digestExternalChatBatch(events: ExternalChatEventEnvelope[]) {
  return createHash('sha256')
    .update(events.map(stableJson).sort().join('\n'), 'utf8')
    .digest('hex');
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

function readDynamicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function serializeExternalChatBinding(
  state: Awaited<ReturnType<typeof readExternalChatBinding>>
) {
  if (!state) return null;
  const chat = (state.binding.settings as Record<string, unknown>)?.chat;
  const parsedChat = externalChatSettingsSchema.safeParse(chat);
  const credentials = state.credentials;
  const errors: string[] = [];
  if (!state.binding.is_enabled) errors.push('binding_disabled');
  if (!chat || typeof chat !== 'object') errors.push('settings_missing');
  else if (!parsedChat.success) errors.push('settings_invalid');
  if (
    chat &&
    typeof chat === 'object' &&
    (chat as Record<string, unknown>).enabled !== true
  ) {
    errors.push('chat_disabled');
  }
  if (
    parsedChat.success &&
    parsedChat.data.enabled &&
    !isExternalChatLiveAuthority(state.binding.settings)
  ) {
    errors.push('authority_not_live');
  }
  if (!credentials?.ingest_secret_hash) errors.push('ingest_secret_missing');
  if (!credentials?.control_secret_encrypted)
    errors.push('control_secret_missing');
  if (!credentials?.verified_at) errors.push('bridge_unverified');
  if (
    credentials?.verified_at &&
    credentials.verified_revision !== credentials.configuration_revision
  ) {
    errors.push('bridge_verification_stale');
  }
  if (credentials?.pending_action)
    errors.push('credential_reconciliation_pending');

  return {
    enabled:
      state.binding.is_enabled && parsedChat.success && parsedChat.data.enabled,
    settings: chat ?? null,
    secrets: {
      control: {
        configured: Boolean(credentials?.control_secret_encrypted),
        lastFour: credentials?.control_secret_last_four ?? null,
        rotatedAt: credentials?.control_secret_rotated_at ?? null,
      },
      ingest: {
        configured: Boolean(credentials?.ingest_secret_hash),
        lastFour: credentials?.ingest_secret_last_four ?? null,
        rotatedAt: credentials?.ingest_secret_rotated_at ?? null,
      },
    },
    verifiedAt: credentials?.verified_at ?? null,
    readiness: { ready: errors.length === 0, errors },
  };
}
