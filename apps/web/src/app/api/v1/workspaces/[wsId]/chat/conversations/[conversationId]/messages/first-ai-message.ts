import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';
import { normalizeChatTimestamp } from '@/lib/chat/chat-timestamp';
import {
  admitInitialAiSettings,
  type InitialAiSettings,
  initialAiSettingsSchema,
  validateInitialAiSettingsReceipt,
} from '@/lib/chat/initial-ai-settings';
import { notifyChatMessageRecipients } from '@/lib/chat/notifications';
import {
  type ChatConversation,
  type ChatMessage,
  type ChatRouteContext,
  callPrivateChatRpc,
  chatRpcErrorResponse,
} from '@/lib/chat/private-rpc';
import {
  getChatRealtimeAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';
import { streamNativeAiConversationResponse } from './native-ai-message';

const creationReceiptSchema = z.object({
  id: z.uuid(),
  wsId: z.uuid(),
  createdBy: z.uuid(),
  type: z.literal('ai'),
  createdAt: z.preprocess(normalizeChatTimestamp, z.iso.datetime()),
  creationRequestId: z.uuid(),
  initialAiSettings: initialAiSettingsSchema.extend({
    actorUserId: z.uuid(),
    wsId: z.uuid(),
    conversationId: z.uuid(),
  }),
});

type FirstMessageResult = {
  conversation: ChatConversation;
  creationReceipt: unknown;
  message: ChatMessage;
  replayed: boolean;
};

export async function sendFirstAiChatMessage({
  auth,
  context,
  conversationId,
  content,
  clientRequestId,
  initialSettings,
  request,
  miraMode,
  timezone,
  clientCapabilities,
}: {
  auth: SessionAuthContext;
  context: ChatRouteContext;
  conversationId: string;
  content: string;
  clientRequestId: string;
  initialSettings: InitialAiSettings;
  request: NextRequest;
  miraMode: boolean;
  timezone?: string;
  clientCapabilities?: string[];
}): Promise<NextResponse> {
  try {
    const admission = await admitInitialAiSettings({
      actorUserId: auth.user.id,
      input: initialSettings,
      wsId: context.normalizedWsId,
    });
    if (!admission.ok)
      return NextResponse.json(
        { message: admission.message },
        { status: admission.status }
      );
    const compactTitle = content.trim().replace(/\s+/gu, ' ');
    const title =
      compactTitle.length <= 64
        ? compactTitle
        : `${compactTitle.slice(0, 61)}...`;
    const result = await callPrivateChatRpc<FirstMessageResult>(
      'chat_create_ai_first_message',
      {
        p_ws_id: context.normalizedWsId,
        p_actor_user_id: auth.user.id,
        p_input: {
          id: conversationId,
          creationRequestId: clientRequestId,
          type: 'ai',
          title,
          modelId: admission.settings.modelId,
          initialAiSettings: admission.settings,
        },
        p_content: content,
      }
    );
    const receipt = creationReceiptSchema.parse(result.creationReceipt);
    validateInitialAiSettingsReceipt({
      actorUserId: auth.user.id,
      conversationId,
      raw: receipt.initialAiSettings,
      requested: admission.settings,
      wsId: context.normalizedWsId,
    });
    const { conversation, message } = result;
    if (
      receipt.id !== conversationId ||
      receipt.creationRequestId !== clientRequestId ||
      receipt.wsId !== context.normalizedWsId ||
      receipt.createdBy !== auth.user.id ||
      conversation.id !== receipt.id ||
      conversation.wsId !== receipt.wsId ||
      conversation.createdBy !== receipt.createdBy ||
      conversation.type !== 'ai' ||
      message.conversationId !== receipt.id ||
      message.senderId !== auth.user.id ||
      message.kind !== 'user' ||
      message.content !== content ||
      message.metadata.clientRequestId !== clientRequestId ||
      typeof result.replayed !== 'boolean'
    ) {
      throw new Error('Invalid first-message receipt');
    }
    const response = streamNativeAiConversationResponse({
      auth,
      context,
      conversation,
      request,
      miraMode,
      timezone,
      clientCapabilities,
      userMessage: message,
      publishInitialMessages: async () => {
        const currentConversation = { ...conversation, latestMessage: message };
        const audience = getChatRealtimeAudience(currentConversation);
        const delivery = { signal: AbortSignal.timeout(5_000) };
        const publications = await Promise.allSettled([
          ...(!result.replayed
            ? [
                publishChatRealtimeEvent(
                  {
                    actorUserId: auth.user.id,
                    audience,
                    conversation: currentConversation,
                    conversationId,
                    type: 'conversation.created',
                    wsId: context.normalizedWsId,
                  },
                  delivery
                ),
                notifyChatMessageRecipients({
                  actorUserId: auth.user.id,
                  conversation: currentConversation,
                  message,
                  wsId: context.normalizedWsId,
                }),
              ]
            : []),
          publishChatRealtimeEvent(
            {
              actorUserId: auth.user.id,
              audience,
              conversationId,
              message,
              type: 'message.created',
              wsId: context.normalizedWsId,
            },
            delivery
          ),
        ]);
        if (publications.some((result) => result.status === 'rejected')) {
          console.warn(
            'Created first chat message but supplemental publication failed',
            { conversationId }
          );
        }
      },
      initialSettings: {
        model_id: admission.settings.modelId,
        credit_source: admission.settings.creditSource,
        credit_ws_id: admission.settings.creditWsId,
        thinking_mode: admission.settings.thinkingMode,
        system_prompt: null,
      },
    });
    // The header is available before body consumption; the client durably binds
    // creation before accepting a USER receipt. It contains no prompt or profile.
    response.headers.set(
      'x-mira-chat-creation',
      Buffer.from(
        JSON.stringify({
          conversation: receipt,
          creationRequestId: clientRequestId,
        })
      ).toString('base64url')
    );
    return response;
  } catch (error) {
    return chatRpcErrorResponse(
      error,
      'Failed to create the first chat message'
    );
  }
}
