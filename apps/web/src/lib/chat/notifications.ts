import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import type { ChatConversation, ChatMessage } from './private-rpc';

type PrivateRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

export interface ChatMessageNotificationResult {
  createdCount: number;
  failedCount: number;
  recipientCount: number;
}

const CHAT_MESSAGE_PREVIEW_LENGTH = 160;

export function getChatPushRecipientUserIds({
  actorUserId,
  conversation,
}: {
  actorUserId: string;
  conversation: Pick<ChatConversation, 'members'>;
}) {
  const recipients = new Set<string>();

  for (const member of conversation.members) {
    if (!member.userId || member.userId === actorUserId) continue;
    if (member.mutedAt) continue;
    recipients.add(member.userId);
  }

  return [...recipients];
}

export async function notifyChatMessageRecipients({
  actorUserId,
  conversation,
  message,
  wsId,
}: {
  actorUserId: string;
  conversation: ChatConversation;
  message: ChatMessage;
  wsId: string;
}): Promise<ChatMessageNotificationResult> {
  if (message.kind !== 'user') {
    return { createdCount: 0, failedCount: 0, recipientCount: 0 };
  }

  const recipientUserIds = getChatPushRecipientUserIds({
    actorUserId,
    conversation,
  });

  if (recipientUserIds.length === 0) {
    return { createdCount: 0, failedCount: 0, recipientCount: 0 };
  }

  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
    const privateRpcClient = getPrivateRpcClient(sbAdmin);
    const title = buildChatNotificationTitle({ conversation, message });
    const description = buildChatNotificationDescription(message);
    const data = {
      conversation_id: conversation.id,
      conversation_type: conversation.type,
      message_id: message.id,
      openTarget: 'chat',
      workspace_id: wsId,
      ws_id: wsId,
    };

    const results = await Promise.allSettled(
      recipientUserIds.map(async (recipientUserId) => {
        const { data: notificationId, error } = await privateRpcClient.rpc(
          'create_chat_message_push_notification',
          {
            p_actor_user_id: actorUserId,
            p_conversation_id: conversation.id,
            p_data: data,
            p_description: description,
            p_message_id: message.id,
            p_title: title,
            p_user_id: recipientUserId,
            p_ws_id: wsId,
          }
        );

        if (error) {
          throw error;
        }

        return notificationId;
      })
    );

    let createdCount = 0;
    let failedCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value) createdCount += 1;
        continue;
      }

      failedCount += 1;
      serverLogger.error('Failed to queue chat message push notification', {
        conversationId: conversation.id,
        error: result.reason,
        messageId: message.id,
        wsId,
      });
    }

    return {
      createdCount,
      failedCount,
      recipientCount: recipientUserIds.length,
    };
  } catch (error) {
    serverLogger.error('Failed to queue chat message push notifications', {
      conversationId: conversation.id,
      error,
      messageId: message.id,
      wsId,
    });

    return {
      createdCount: 0,
      failedCount: recipientUserIds.length,
      recipientCount: recipientUserIds.length,
    };
  }
}

function getPrivateRpcClient(sbAdmin: unknown) {
  return (
    typeof sbAdmin === 'object' && sbAdmin !== null && 'schema' in sbAdmin
      ? (
          sbAdmin as {
            schema: (schema: 'private') => PrivateRpcClient;
          }
        ).schema('private')
      : sbAdmin
  ) as PrivateRpcClient;
}

function buildChatNotificationTitle({
  conversation,
  message,
}: {
  conversation: ChatConversation;
  message: ChatMessage;
}) {
  const senderName = message.sender?.displayName?.trim() || 'Someone';
  const conversationTitle = conversation.title?.trim();

  if (!conversationTitle || conversation.type === 'direct') {
    return senderName;
  }

  return `${senderName} in ${conversationTitle}`;
}

function buildChatNotificationDescription(message: ChatMessage) {
  const content = message.content.trim().replace(/\s+/gu, ' ');

  if (content.length === 0) {
    return message.attachments.length > 0
      ? 'Sent an attachment'
      : 'Sent a message';
  }

  if (content.length <= CHAT_MESSAGE_PREVIEW_LENGTH) {
    return content;
  }

  return `${content.slice(0, CHAT_MESSAGE_PREVIEW_LENGTH - 1)}...`;
}
