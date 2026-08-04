import { z } from 'zod';
import type { ChatConversation, ChatMessage } from '@/lib/chat/private-rpc';
import type { ExternalChatEvent, ExternalChatEventEnvelope } from './schemas';
import {
  applyExternalChatMessageState,
  digestExternalChatEnvelope,
  importExternalChatEvent,
  readExternalChatSourceEvent,
  recordExternalChatSourceEvent,
  upsertExternalChatObservation,
} from './store';

export type ExternalChatIngestContext = {
  configurationRevision: number;
  connectorKey: string;
  settings: unknown;
  wsId: string;
};

export type ExternalChatProcessResult = {
  accepted?: boolean;
  conversation?: ChatConversation;
  conversationCreated?: boolean;
  conversationId?: string;
  conflict?: 'payload_mismatch';
  deferred?: boolean;
  duplicate?: boolean;
  ephemeral?: boolean;
  found?: boolean;
  message?: ChatMessage;
  messageId?: string;
  observationId?: string;
  threadId?: string;
};

export async function processExternalChatEnvelope(
  event: ExternalChatEventEnvelope,
  context: ExternalChatIngestContext
): Promise<ExternalChatProcessResult> {
  const existing = await readExternalChatSourceEvent({
    connectorKey: context.connectorKey,
    sourceEventId: event.eventId,
    wsId: context.wsId,
  });
  if (existing) {
    if (existing.payload_digest !== digestExternalChatEnvelope(event))
      return { conflict: 'payload_mismatch', duplicate: true };
    const result = existing.result as ExternalChatProcessResult;
    if (existing.delivery_mode === 'probe' && event.deliveryMode !== 'probe') {
      await recordExternalChatSourceEvent({
        connectorKey: context.connectorKey,
        event,
        result,
        threadId: typeof result.threadId === 'string' ? result.threadId : null,
        wsId: context.wsId,
      });
    }
    return {
      ...result,
      duplicate: true,
    };
  }

  let result: ExternalChatProcessResult;
  if (event.kind === 'message') {
    result = await importExternalChatEvent({
      configurationRevision: context.configurationRevision,
      connectorKey: context.connectorKey,
      event,
      mappedUserId: getRoutingUserId(
        context.settings,
        event.agentId,
        event.direction
      ),
      wsId: context.wsId,
    });
  } else if (
    event.kind === 'message_state' ||
    event.kind === 'message_deleted'
  ) {
    result = await applyExternalChatMessageState({
      connectorKey: context.connectorKey,
      event,
      wsId: context.wsId,
    });
    if (result.found === false) return { ...result, deferred: true };
  } else if (event.kind === 'observation') {
    result = await upsertExternalChatObservation({
      connectorKey: context.connectorKey,
      event,
      wsId: context.wsId,
    });
  } else {
    result = { accepted: true, ephemeral: true };
  }

  await recordExternalChatSourceEvent({
    connectorKey: context.connectorKey,
    event,
    result,
    threadId: typeof result.threadId === 'string' ? result.threadId : null,
    wsId: context.wsId,
  });
  return result;
}

export function getRoutingUserId(
  settings: unknown,
  agentId: string,
  direction: 'staff' | 'system' | 'visitor'
) {
  if (!settings || typeof settings !== 'object') return null;
  const chat = (settings as Record<string, unknown>).chat;
  if (!chat || typeof chat !== 'object') return null;
  const mappings = (chat as Record<string, unknown>).agentMappings;
  const mapped =
    mappings && typeof mappings === 'object' && !Array.isArray(mappings)
      ? (mappings as Record<string, unknown>)[agentId]
      : null;
  if (typeof mapped === 'string' && z.string().uuid().safeParse(mapped).success)
    return mapped;
  if (direction !== 'visitor') return null;

  const inboxDefaults = (chat as Record<string, unknown>).inboxDefaults;
  if (!inboxDefaults || typeof inboxDefaults !== 'object') return null;
  const recipientUserId = (inboxDefaults as Record<string, unknown>)
    .recipientUserId;
  return typeof recipientUserId === 'string' &&
    z.string().uuid().safeParse(recipientUserId).success
    ? recipientUserId
    : null;
}

export function normalizeLegacyExternalChatEvent(
  event: ExternalChatEvent
): ExternalChatEventEnvelope {
  return {
    agentId: event.agentId,
    attachment: event.attachment,
    content: event.content,
    contentType: event.contentType,
    context: event.context,
    deliveryMode: 'live',
    direction: event.direction,
    eventId: event.messageId,
    kind: 'message',
    messageId: event.messageId,
    status: event.status,
    timestamp: event.timestamp,
    version: 2,
    visitorId: event.visitorId,
    visitorProfile: event.visitorProfile,
  };
}
