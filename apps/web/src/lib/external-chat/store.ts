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
        'control_secret_encrypted, control_secret_last_four, control_secret_rotated_at, ingest_secret_hash, ingest_secret_last_four, ingest_secret_rotated_at, verified_at'
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
  const { data: current, error: readError } = await admin
    .from('workspace_external_project_bindings')
    .select('settings')
    .eq('ws_id', wsId)
    .single();
  if (readError) throw new Error(readError.message);

  const nextSettings = {
    ...((current.settings as Record<string, unknown>) ?? {}),
    chat: settings,
  };
  const { error } = await admin
    .from('workspace_external_project_bindings')
    .update({ settings: nextSettings as Json, updated_by: actorId })
    .eq('ws_id', wsId);
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

export async function importExternalChatEvent({
  connectorKey,
  event,
  wsId,
}: {
  connectorKey: string;
  event: ExternalChatEvent;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const profileDisplayName = readDynamicString(
    event.visitorProfile.displayName ?? event.visitorProfile.name
  );
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
  if (!credentials?.ingest_secret_hash) errors.push('ingest_secret_missing');
  if (!credentials?.control_secret_encrypted)
    errors.push('control_secret_missing');
  if (!credentials?.verified_at) errors.push('bridge_unverified');

  return {
    enabled: state.binding.is_enabled,
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
