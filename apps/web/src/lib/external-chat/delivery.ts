import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { decryptControlSecret, signControlRequest } from './crypto';
import { readExternalChatBinding } from './store';

type ExternalThreadRow = {
  connector_key: string;
  id: string;
  remote_agent_id: string;
  remote_visitor_id: string;
};

export type ExternalChatDelivery = {
  idempotencyKey: string;
  thread: ExternalThreadRow;
};

function getBridgeBaseUrl(settings: unknown) {
  if (!settings || typeof settings !== 'object') return null;
  const chat = (settings as Record<string, unknown>).chat;
  if (!chat || typeof chat !== 'object') return null;
  const value = (chat as Record<string, unknown>).bridgeBaseUrl;
  return typeof value === 'string' ? value.replace(/\/$/, '') : null;
}

async function postSignedControlRequest({
  body,
  bridgeBaseUrl,
  path,
  secret,
}: {
  body: string;
  bridgeBaseUrl: string;
  path: string;
  secret: string;
}) {
  const timestamp = new Date().toISOString();
  return fetch(`${bridgeBaseUrl}${path}`, {
    body,
    headers: {
      'content-type': 'application/json',
      'x-control-signature': signControlRequest({ body, secret, timestamp }),
      'x-control-timestamp': timestamp,
    },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
}

export async function verifyExternalChatControl(wsId: string) {
  const state = await readExternalChatBinding(wsId);
  const ciphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  if (!state?.binding.is_enabled || !ciphertext || !bridgeBaseUrl) {
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

export async function updateExternalChatBridgeCredential({
  action,
  secret: nextSecret,
  wsId,
}: {
  action: 'rotate_control' | 'set_ingest';
  secret: string;
  wsId: string;
}) {
  const state = await readExternalChatBinding(wsId);
  const ciphertext = state?.credentials?.control_secret_encrypted;
  const bridgeBaseUrl = getBridgeBaseUrl(state?.binding.settings);
  if (!state?.binding.is_enabled || !ciphertext || !bridgeBaseUrl) {
    throw new Error('External chat bridge is not paired');
  }

  const body = JSON.stringify({ action, secret: nextSecret });
  const secret = await decryptControlSecret(wsId, ciphertext);
  const response = await postSignedControlRequest({
    body,
    bridgeBaseUrl,
    path: '/control/v1/credentials',
    secret,
  });
  if (!response.ok) {
    throw new Error(
      `External chat bridge credential update failed (${response.status})`
    );
  }
}

export async function deliverExternalChatReplyIfBound({
  content,
  conversationId,
  senderId,
  wsId,
}: {
  content: string;
  conversationId: string;
  senderId: string;
  wsId: string;
}): Promise<ExternalChatDelivery | null> {
  const admin = await createAdminClient({ noCookie: true });
  const privateDb = admin.schema('private') as any;
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
  if (!state?.binding.is_enabled || !ciphertext || !bridgeBaseUrl) {
    throw new Error('External chat bridge is not ready');
  }

  const idempotencyKey = randomUUID();
  const body = JSON.stringify({
    agentId: (thread as ExternalThreadRow).remote_agent_id,
    content,
    idempotencyKey,
    senderId,
    visitorId: (thread as ExternalThreadRow).remote_visitor_id,
  });
  const secret = await decryptControlSecret(wsId, ciphertext);
  const response = await postSignedControlRequest({
    body,
    bridgeBaseUrl,
    path: '/control/v1/replies',
    secret,
  });
  if (!response.ok) {
    throw new Error(
      `External chat bridge rejected delivery (${response.status})`
    );
  }
  return { idempotencyKey, thread: thread as ExternalThreadRow };
}

export async function recordExternalChatReply({
  delivery,
  messageId,
  wsId,
}: {
  delivery: ExternalChatDelivery;
  messageId: string;
  wsId: string;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const { error } = await (admin.schema('private') as any)
    .from('external_chat_events')
    .insert({
      connector_key: delivery.thread.connector_key,
      direction: 'staff',
      message_id: messageId,
      metadata: { deliveredBy: 'control', nativeOrigin: true },
      remote_message_id: delivery.idempotencyKey,
      thread_id: delivery.thread.id,
      ws_id: wsId,
    });
  if (error) throw new Error(error.message);
}
