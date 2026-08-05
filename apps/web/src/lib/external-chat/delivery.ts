import { createHash } from 'node:crypto';
import type { ChatAttachmentDraft } from '@tuturuuu/internal-api';
import {
  downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveTuturuuuWebAppUrl } from '@tuturuuu/utils/next-config';
import type { ChatMessage } from '@/lib/chat/private-rpc';
import { decryptControlSecret, signControlRequest } from './crypto';
import { safeExternalChatFetch } from './safe-control-request';
import { isExternalChatEnabled, isExternalChatLiveAuthority } from './schemas';
import { externalChatPrivateDb, readExternalChatBinding } from './store';

type ExternalThreadRow = {
  connector_key: string;
  id: string;
  remote_agent_id: string;
  remote_visitor_id: string;
};

const MAX_EXTERNAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const EXTERNAL_ATTACHMENT_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type ExternalChatMutationDb = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: string
      ) => {
        eq: (
          column: string,
          value: string
        ) => {
          is: (
            column: string,
            value: null
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
  };
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: unknown }>;
};

function externalChatMutationDb(admin: unknown) {
  return externalChatPrivateDb(admin) as unknown as ExternalChatMutationDb;
}

export type ExternalChatDelivery = {
  deliveryId: string;
  idempotencyKey: string;
  remoteMessageId: string;
  thread: ExternalThreadRow;
};

export type ReservedExternalChatDelivery = {
  configurationRevision: number;
  delivered: boolean;
  deliveryId: string;
  idempotencyKey: string;
  messageId: string | null;
  threadId: string;
};

export async function isExternalChatConversation({
  conversationId,
  wsId,
}: {
  conversationId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatPrivateDb(admin)
    .from('external_chat_threads')
    .select('id')
    .eq('ws_id', wsId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function deleteExternalChatMessageIfBound({
  conversationId,
  messageId,
  wsId,
}: {
  conversationId: string;
  messageId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const privateDb = externalChatPrivateDb(admin);
  const { data: thread, error: threadError } = await privateDb
    .from('external_chat_threads')
    .select('id, connector_key, remote_agent_id, remote_visitor_id')
    .eq('ws_id', wsId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (threadError) throw new Error(threadError.message);
  if (!thread) return false;

  const { data: event, error: eventError } = await privateDb
    .from('external_chat_events')
    .select('remote_message_id')
    .eq('ws_id', wsId)
    .eq('thread_id', thread.id)
    .eq('message_id', messageId)
    .maybeSingle();
  if (eventError) throw new Error(eventError.message);
  if (!event) throw new Error('external_chat_message_unmapped');

  const state = await readExternalChatBinding(wsId);
  if (
    !state?.binding.is_enabled ||
    !isExternalChatLiveAuthority(state.binding.settings)
  ) {
    throw new Error('external_chat_control_unavailable');
  }

  const control = await createExternalChatControlClient(wsId);
  await control('/control/v1/messages/delete', {
    agentId: thread.remote_agent_id,
    messageId: event.remote_message_id,
    visitorId: thread.remote_visitor_id,
  });
  return true;
}

function getBridgeBaseUrl(settings: unknown) {
  if (!settings || typeof settings !== 'object') return null;
  const chat = (settings as Record<string, unknown>).chat;
  if (!chat || typeof chat !== 'object') return null;
  const value = (chat as Record<string, unknown>).bridgeBaseUrl;
  return typeof value === 'string' ? value.replace(/\/+$/u, '') : null;
}

function getPublicPlatformUrl() {
  return resolveTuturuuuWebAppUrl({
    env: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_WEB_APP_URL: process.env.NEXT_PUBLIC_WEB_APP_URL,
      WEB_APP_URL: process.env.WEB_APP_URL,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
  });
}

async function postSignedControlRequest({
  body,
  bridgeBaseUrl,
  path,
  secret,
  timeoutMs = 10_000,
}: {
  body: string;
  bridgeBaseUrl: string;
  path: string;
  secret: string;
  timeoutMs?: number;
}) {
  const timestamp = new Date().toISOString();
  return safeExternalChatFetch(`${bridgeBaseUrl}${path}`, {
    body,
    headers: {
      'content-type': 'application/json',
      'x-control-signature': signControlRequest({ body, secret, timestamp }),
      'x-control-timestamp': timestamp,
    },
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function requestExternalChatControl(
  wsId: string,
  path: string,
  payload: Record<string, unknown>,
  options?: { timeoutMs?: number }
) {
  const client = await createExternalChatControlClient(wsId);
  return client(path, payload, options);
}

export async function createExternalChatControlClient(wsId: string) {
  const state = await readExternalChatBinding(wsId);
  const ciphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  if (
    !state?.binding.is_enabled ||
    !isExternalChatEnabled(state.binding.settings) ||
    !state.credentials?.verified_at ||
    state.credentials.verified_revision !==
      state.credentials.configuration_revision ||
    state.credentials.pending_action ||
    !ciphertext ||
    !bridgeBaseUrl
  )
    throw new Error('external_chat_control_unavailable');

  const secret = await decryptControlSecret(wsId, ciphertext);
  return async (
    path: string,
    payload: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ) => {
    const body = JSON.stringify(payload);
    const response = await postSignedControlRequest({
      body,
      bridgeBaseUrl,
      path,
      secret,
      timeoutMs: options?.timeoutMs,
    });
    if (!response.ok)
      throw new Error(`external_chat_control_failed:${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };
}

export async function verifyExternalChatControl(wsId: string) {
  const state = await readExternalChatBinding(wsId);
  const ciphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  if (
    !state?.binding.is_enabled ||
    !isExternalChatEnabled(state.binding.settings) ||
    !ciphertext ||
    !bridgeBaseUrl
  ) {
    throw new Error('External chat bridge is not ready for verification');
  }

  const body = '{}';
  const secret = await decryptControlSecret(wsId, ciphertext);
  const response = await postSignedControlRequest({
    body,
    bridgeBaseUrl,
    path: '/control/v1/verify',
    secret,
  });
  if (!response.ok) {
    throw new Error(
      `External chat bridge verification failed (${response.status})`
    );
  }
}

export async function configureExternalChatBridge({
  ingestSecret,
  pairingTicket,
  wsId,
}: {
  ingestSecret: string;
  pairingTicket: string;
  wsId: string;
}) {
  const state = await readExternalChatBinding(wsId);
  const controlCiphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  if (
    !state?.binding.is_enabled ||
    !isExternalChatEnabled(state.binding.settings) ||
    !controlCiphertext ||
    !state.credentials?.ingest_secret_hash ||
    !bridgeBaseUrl
  ) {
    throw new Error('External chat bridge is not ready for pairing');
  }

  const body = JSON.stringify({
    bindingId: wsId,
    controlSecret: await decryptControlSecret(wsId, controlCiphertext),
    ingestSecret,
    pairingTicket,
    platformUrl: getPublicPlatformUrl(),
  });
  const response = await safeExternalChatFetch(
    `${bridgeBaseUrl}/control/v1/configure`,
    {
      body,
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) {
    throw new Error(`External chat bridge pairing failed (${response.status})`);
  }
}

export async function updateExternalChatBridgeCredential({
  action,
  secret: nextSecret,
  signingCiphertext,
  wsId,
}: {
  action: 'clear_control' | 'clear_ingest' | 'rotate_control' | 'set_ingest';
  secret?: string;
  signingCiphertext?: string;
  wsId: string;
}) {
  const state = await readExternalChatBinding(wsId);
  const ciphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  const isClear = action === 'clear_control' || action === 'clear_ingest';
  if (
    !ciphertext ||
    !bridgeBaseUrl ||
    (!isClear &&
      (!state?.binding.is_enabled ||
        !isExternalChatEnabled(state.binding.settings)))
  ) {
    throw new Error('External chat bridge is not paired');
  }

  const body = JSON.stringify({
    action,
    ...(nextSecret ? { secret: nextSecret } : {}),
  });
  const secret = await decryptControlSecret(
    wsId,
    signingCiphertext ?? ciphertext
  );
  const response = await postSignedControlRequest({
    body,
    bridgeBaseUrl,
    path: '/control/v1/credentials',
    secret,
  });
  if (isClear && (await provesCredentialAlreadyCleared(response, action))) {
    return;
  }
  if (!response.ok) {
    throw new Error(
      `External chat bridge credential update failed (${response.status})`
    );
  }
}

async function provesCredentialAlreadyCleared(
  response: Response,
  action: 'clear_control' | 'clear_ingest' | 'rotate_control' | 'set_ingest'
) {
  if (response.status !== 409) return false;
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return (
    payload?.error === 'credential_already_cleared' && payload.action === action
  );
}

export async function deliverExternalChatReplyIfBound({
  attachments = [],
  content,
  conversationId,
  idempotencyKey,
  deliveryId,
  configurationRevision,
  senderId,
  wsId,
}: {
  attachments?: ChatAttachmentDraft[];
  content: string;
  conversationId: string;
  idempotencyKey: string;
  deliveryId: string;
  configurationRevision: number;
  senderId: string;
  wsId: string;
}): Promise<ExternalChatDelivery | null> {
  const admin = await createAdminClient({ noCookie: true });
  const privateDb = externalChatPrivateDb(admin);
  const { data: thread, error: threadError } = await privateDb
    .from('external_chat_threads')
    .select('id, connector_key, remote_agent_id, remote_visitor_id')
    .eq('ws_id', wsId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (threadError) throw new Error(threadError.message);
  if (!thread) return null;

  const state = await readExternalChatBinding(wsId);
  const ciphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  if (
    !state?.binding.is_enabled ||
    !isExternalChatLiveAuthority(state.binding.settings) ||
    !state.credentials?.verified_at ||
    state.credentials.verified_revision !==
      state.credentials.configuration_revision ||
    state.credentials.pending_action ||
    state.credentials.configuration_revision !== configurationRevision ||
    !ciphertext ||
    !bridgeBaseUrl
  ) {
    throw new Error('External chat bridge is not ready');
  }

  const attachment = attachments[0];
  const attachmentPayload = attachment
    ? await prepareExternalChatAttachment({ attachment, wsId })
    : null;
  const body = JSON.stringify({
    agentId: (thread as ExternalThreadRow).remote_agent_id,
    content,
    ...(attachmentPayload ?? {}),
    idempotencyKey,
    mirrorToPlatform: false,
    senderId,
    visitorId: (thread as ExternalThreadRow).remote_visitor_id,
  });
  const secret = await decryptControlSecret(wsId, ciphertext);
  const response = await postSignedControlRequest({
    body,
    bridgeBaseUrl,
    path: attachmentPayload ? '/control/v1/attachments' : '/control/v1/replies',
    secret,
  });
  if (!response.ok) {
    throw new Error(
      `External chat bridge rejected delivery (${response.status})`
    );
  }
  const result = (await response.json()) as Record<string, unknown>;
  const remoteMessageId =
    typeof result.messageId === 'string' ? result.messageId.trim() : '';
  if (!remoteMessageId)
    throw new Error('External chat bridge returned no message identity');
  return {
    deliveryId,
    idempotencyKey,
    remoteMessageId,
    thread: thread as ExternalThreadRow,
  };
}

export async function reserveExternalChatReply({
  attachments = [],
  clientRequestId,
  content,
  conversationId,
  replyToMessageId,
  senderId,
  wsId,
}: {
  attachments?: ChatAttachmentDraft[];
  clientRequestId: string;
  content: string;
  conversationId: string;
  replyToMessageId: string | null;
  senderId: string;
  wsId: string;
}) {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ clientRequestId, conversationId, senderId }))
    .digest('hex');
  const payloadHash = createExternalChatReplyPayloadHash({
    attachments,
    content,
    replyToMessageId,
  });
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatMutationDb(admin).rpc(
    'external_chat_reserve_reply',
    {
      p_actor_user_id: senderId,
      p_conversation_id: conversationId,
      p_payload_hash: payloadHash,
      p_reply_to_message_id: replyToMessageId,
      p_request_fingerprint: fingerprint,
      p_ws_id: wsId,
    }
  );
  if (error) throw error;
  return data as ReservedExternalChatDelivery | null;
}

export async function markExternalChatReplyDelivered({
  deliveryId,
  remoteMessageId,
  wsId,
}: {
  deliveryId: string;
  remoteMessageId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await externalChatMutationDb(admin).rpc(
    'external_chat_mark_reply_delivered',
    {
      p_delivery_id: deliveryId,
      p_remote_message_id: remoteMessageId,
      p_ws_id: wsId,
    }
  );
  if (error) throw error;
  const result = data as { remoteMessageId?: unknown } | null;
  if (result?.remoteMessageId !== remoteMessageId.trim()) {
    throw new Error('external_chat_delivery_identity_mismatch');
  }
}

export async function cancelExternalChatReply({
  deliveryId,
  wsId,
}: {
  deliveryId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { error } = await externalChatMutationDb(admin)
    .from('external_chat_outbound_deliveries')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('ws_id', wsId)
    .is('delivered_at', null);
  if (error) throw new Error(error.message);
}

export async function finalizeExternalChatReply({
  attachments = [],
  content,
  deliveryId,
  replyToMessageId,
  senderId,
  wsId,
}: {
  attachments?: ChatAttachmentDraft[];
  content: string;
  deliveryId: string;
  replyToMessageId: string | null;
  senderId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const payloadHash = createExternalChatReplyPayloadHash({
    attachments,
    content,
    replyToMessageId,
  });
  const { data, error } = await externalChatMutationDb(admin).rpc(
    'external_chat_finalize_reply',
    {
      p_actor_user_id: senderId,
      p_attachments: attachments,
      p_content: content,
      p_delivery_id: deliveryId,
      p_payload_hash: payloadHash,
      p_reply_to_message_id: replyToMessageId,
      p_ws_id: wsId,
    }
  );
  if (error) throw error;
  return data as { message: ChatMessage; replayed: boolean };
}

function createExternalChatReplyPayloadHash({
  attachments = [],
  content,
  replyToMessageId,
}: {
  attachments?: ChatAttachmentDraft[];
  content: string;
  replyToMessageId: string | null;
}) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        attachments: attachments.map((attachment) => ({
          contentType: attachment.contentType ?? null,
          filename: attachment.filename,
          fullPath: attachment.fullPath ?? null,
          path: attachment.path,
          sizeBytes: attachment.sizeBytes ?? null,
          storageWsId: attachment.storageWsId ?? null,
        })),
        content,
        replyToMessageId,
      })
    )
    .digest('hex');
}

export async function prepareExternalChatAttachment({
  attachment,
  wsId,
}: {
  attachment: ChatAttachmentDraft;
  wsId: string;
}) {
  if (attachment.storageWsId && attachment.storageWsId !== wsId)
    throw new Error('external_attachment_workspace_invalid');
  if (
    typeof attachment.sizeBytes === 'number' &&
    attachment.sizeBytes > MAX_EXTERNAL_ATTACHMENT_BYTES
  ) {
    throw new Error('external_attachment_size_invalid');
  }
  const { provider } = await resolveWorkspaceStorageProvider(wsId);
  const metadata = await getWorkspaceStorageObjectMetadataForProvider(
    wsId,
    provider,
    attachment.path
  );
  if (metadata.size < 1 || metadata.size > MAX_EXTERNAL_ATTACHMENT_BYTES) {
    throw new Error('external_attachment_size_invalid');
  }
  const contentType = (metadata.contentType ?? '').toLowerCase();
  if (!EXTERNAL_ATTACHMENT_TYPES.has(contentType))
    throw new Error('external_attachment_type_invalid');
  const downloaded = await downloadWorkspaceStorageObjectForProvider(
    wsId,
    provider,
    attachment.path
  );
  if (
    downloaded.buffer.byteLength < 1 ||
    downloaded.buffer.byteLength > MAX_EXTERNAL_ATTACHMENT_BYTES
  ) {
    throw new Error('external_attachment_size_invalid');
  }
  return {
    contentType,
    data: Buffer.from(downloaded.buffer).toString('base64'),
    filename: attachment.filename,
  };
}
