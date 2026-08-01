import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import type { ExternalChatEvent, ExternalChatSettings } from './schemas';

type CredentialRow = {
  control_secret_encrypted: string | null;
  control_secret_last_four: string | null;
  control_secret_rotated_at: string | null;
  ingest_secret_hash: string | null;
  ingest_secret_last_four: string | null;
  ingest_secret_rotated_at: string | null;
  verified_at: string | null;
  pending_action: 'rotate_control' | 'set_ingest' | null;
  pending_secret_encrypted: string | null;
  pending_secret_hash: string | null;
  pending_secret_last_four: string | null;
  pending_created_at: string | null;
};

type BindingRow = {
  canonical_project_id: string | null;
  is_enabled: boolean;
  settings: Json;
};

type AdminClient = SupabaseClient<Database>;

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
        'control_secret_encrypted, control_secret_last_four, control_secret_rotated_at, ingest_secret_hash, ingest_secret_last_four, ingest_secret_rotated_at, verified_at, pending_action, pending_secret_encrypted, pending_secret_hash, pending_secret_last_four, pending_created_at'
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

export async function upsertExternalChatCredentials(
  wsId: string,
  values: Record<string, string | null>
) {
  const admin = await createAdminClient({ noCookie: true });
  const { error } = await externalChatPrivateDb(admin)
    .from('external_chat_binding_credentials')
    .upsert({ ws_id: wsId, ...values }, { onConflict: 'ws_id' });
  if (error) throw new Error(error.message);
}

export async function stageExternalChatCredential(
  wsId: string,
  pending: {
    action: 'rotate_control' | 'set_ingest';
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
  action: 'rotate_control' | 'set_ingest',
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
  controlSecretEncrypted: string
) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_mark_verified',
    {
      p_control_secret_encrypted: controlSecretEncrypted,
      p_ws_id: wsId,
    }
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
  connectorKey,
  event,
  mappedUserId,
  wsId,
}: {
  connectorKey: string;
  event: ExternalChatEvent;
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
    externalSender: {
      direction: event.direction,
      ...(profileDisplayName ? { displayName: profileDisplayName } : {}),
    },
    status: event.status,
  };
  const { data, error } = await externalChatPrivateDb(admin).rpc(
    'external_chat_import_event',
    {
      p_connector_key: connectorKey,
      p_content: event.content,
      p_direction: event.direction,
      ...(mappedUserId ? { p_mapped_user_id: mappedUserId } : {}),
      p_message_metadata: messageMetadata as Json,
      p_occurred_at: event.timestamp,
      p_remote_agent_id: event.agentId,
      p_remote_message_id: event.messageId,
      p_remote_visitor_id: event.visitorId,
      p_thread_metadata: event.visitorProfile as Json,
      p_ws_id: wsId,
    }
  );
  if (error) throw new Error(error.message);
  return data as {
    conversationId?: string;
    duplicate: boolean;
    messageId: string;
    threadId?: string;
  };
}

function readDynamicString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function serializeExternalChatBinding(
  state: Awaited<ReturnType<typeof readExternalChatBinding>>
) {
  if (!state) return null;
  const chat = (state.binding.settings as Record<string, unknown>)?.chat;
  const credentials = state.credentials;
  const errors: string[] = [];
  if (!state.binding.is_enabled) errors.push('binding_disabled');
  if (!chat || typeof chat !== 'object') errors.push('settings_missing');
  if (
    chat &&
    typeof chat === 'object' &&
    (chat as Record<string, unknown>).enabled !== true
  ) {
    errors.push('chat_disabled');
  }
  if (!credentials?.ingest_secret_hash) errors.push('ingest_secret_missing');
  if (!credentials?.control_secret_encrypted)
    errors.push('control_secret_missing');
  if (!credentials?.verified_at) errors.push('bridge_unverified');
  if (credentials?.pending_action)
    errors.push('credential_reconciliation_pending');

  return {
    enabled:
      state.binding.is_enabled &&
      Boolean(
        chat &&
          typeof chat === 'object' &&
          (chat as Record<string, unknown>).enabled === true
      ),
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
