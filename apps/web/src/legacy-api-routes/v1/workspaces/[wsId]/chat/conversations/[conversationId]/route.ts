import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  archiveAiChatConversation,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  type ChatConversationDeleteResult,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  getChatRealtimeAudience,
  getChatRealtimeUserAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const updateConversationSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  muted: z.boolean().optional(),
  pinned: z.boolean().optional(),
  title: z.string().trim().max(255).nullable().optional(),
});

export const PATCH = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = updateConversationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    const { muted, ...conversationInput } = parsed.data;
    const updatesConversation =
      muted === undefined ||
      conversationInput.description !== undefined ||
      conversationInput.pinned !== undefined ||
      conversationInput.title !== undefined;

    try {
      let conversation: ChatConversation | undefined;
      if (updatesConversation) {
        conversation = await callPrivateChatRpc<ChatConversation>(
          'chat_update_conversation',
          {
            p_actor_user_id: auth.user.id,
            p_conversation_id: params.conversationId,
            p_input: conversationInput,
            p_ws_id: context.context.normalizedWsId,
          }
        );
      }
      if (muted !== undefined) {
        conversation = await callPrivateChatRpc<ChatConversation>(
          'chat_set_own_mute',
          {
            p_actor_user_id: auth.user.id,
            p_conversation_id: params.conversationId,
            p_muted: muted,
            p_ws_id: context.context.normalizedWsId,
          }
        );
      }
      if (!conversation) {
        return NextResponse.json(
          { message: 'Invalid request body' },
          { status: 400 }
        );
      }

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversation,
        conversationId: conversation.id,
        type: 'conversation.updated',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ conversation });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to update conversation');
    }
  },
  { allowAppSessionAuth: true }
);

export const DELETE = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const result = await archiveAiChatConversation({
          conversationId: params.conversationId,
          supabase: auth.supabase,
          userId: auth.user.id,
        });

        if (!result) {
          return NextResponse.json(
            { message: 'Conversation not found' },
            { status: 404 }
          );
        }

        await publishChatRealtimeEvent({
          actorUserId: auth.user.id,
          audience: getChatRealtimeUserAudience(auth.user.id),
          conversationId: params.conversationId,
          result,
          type: 'conversation.deleted',
          wsId: context.context.normalizedWsId,
        });

        return NextResponse.json({ result });
      }

      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      const result = await callPrivateChatRpc<ChatConversationDeleteResult>(
        'chat_delete_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversationId: params.conversationId,
        result,
        type: 'conversation.deleted',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ result });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to delete conversation');
    }
  },
  { allowAppSessionAuth: true }
);
