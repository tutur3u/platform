import { z } from 'zod';
import type { ChatConversation, ChatMessage } from '@/lib/chat/private-rpc';
import type { ExternalChatEvent, ExternalChatEventEnvelope } from './schemas';
import {
  claimExternalChatSourceEvent,
  hydrateExternalChatReplayResult,
  recordExternalChatSourceEvent,
  releaseExternalChatSourceEvent,
} from './source-events';
import {
  applyExternalChatMessageState,
  importExternalChatEvent,
  resolveExternalChatThread,
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
  const claim = await claimExternalChatSourceEvent({
    connectorKey: context.connectorKey,
    event,
    wsId: context.wsId,
  });
  if (claim.status === 'payload_mismatch')
    return { conflict: 'payload_mismatch', duplicate: true };
  if (claim.status === 'in_progress') return { deferred: true };
  if (claim.status === 'duplicate') {
    const result = (claim.result ?? {}) as ExternalChatProcessResult;
    const replay =
      event.deliveryMode === 'live'
        ? await hydrateExternalChatReplayResult(result, context.wsId)
        : result;
    return {
      ...replay,
      duplicate: true,
    };
  }

  try {
    let result: ExternalChatProcessResult;
    if (event.deliveryMode === 'probe') {
      result = { accepted: true };
    } else if (event.kind === 'message') {
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
      if (result.found === false) {
        await releaseExternalChatSourceEvent({
          claimToken: claim.claimToken,
          connectorKey: context.connectorKey,
          event,
          wsId: context.wsId,
        });
        return { ...result, deferred: true };
      }
    } else if (event.kind === 'observation') {
      result = await upsertExternalChatObservation({
        connectorKey: context.connectorKey,
        event,
        wsId: context.wsId,
      });
    } else {
      const thread = await resolveExternalChatThread({
        connectorKey: context.connectorKey,
        event,
        wsId: context.wsId,
      });
      result = {
        accepted: true,
        conversationId: thread.found ? thread.conversationId : undefined,
        ephemeral: true,
        found: thread.found,
        threadId: thread.found ? thread.threadId : undefined,
      };
    }

    await recordExternalChatSourceEvent({
      claimToken: claim.claimToken,
      connectorKey: context.connectorKey,
      event,
      result,
      threadId: typeof result.threadId === 'string' ? result.threadId : null,
      wsId: context.wsId,
    });
    return result;
  } catch (error) {
    await releaseExternalChatSourceEvent({
      claimToken: claim.claimToken,
      connectorKey: context.connectorKey,
      event,
      wsId: context.wsId,
    }).catch((releaseError) => {
      console.warn('Failed to release external chat source event claim', {
        error: releaseError,
        sourceEventId: event.eventId,
        wsId: context.wsId,
      });
    });
    throw error;
  }
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
