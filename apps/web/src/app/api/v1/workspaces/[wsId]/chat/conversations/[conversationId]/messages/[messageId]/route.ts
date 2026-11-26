import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  deleteAiChatMessage,
  isAiChatConversationId,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  type ChatMessage,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  getChatRealtimeAudience,
  getChatRealtimeUserAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';
import {
  deleteExternalChatMessageIfBound,
  isExternalChatConversation,
} from '@/lib/external-chat/delivery';

type RouteParams = {
  conversationId: string;
  messageId: string;
  wsId: string;
};

const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

export const PATCH = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'create_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (
        await isExternalChatConversation({
          conversationId: params.conversationId,
          wsId: context.context.normalizedWsId,
        })
      ) {
        return NextResponse.json(
          {
            code: 'external_message_edit_unsupported',
            message: 'Editing connected-site messages is not supported',
          },
          { status: 409 }
        );
      }
    } catch (error) {
      console.error('Failed to resolve external chat edit route', {
        code: error instanceof Error ? error.message : 'unknown',
      });
      return NextResponse.json(
        { message: 'Failed to resolve chat edit route' },
        { status: 500 }
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = editMessageSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const message = await callPrivateChatRpc<ChatMessage | null>(
        'chat_edit_message',
        {
          p_actor_user_id: auth.user.id,
          p_content: parsed.data.content,
          p_conversation_id: params.conversationId,
          p_message_id: params.messageId,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      if (!message) {
        return NextResponse.json(
          { message: 'Message not found' },
          { status: 404 }
        );
      }
      const conversation = await callPrivateChatRpc<ChatConversation | null>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      if (!conversation) return NextResponse.json({ message });

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversationId: message.conversationId,
        message,
        type: 'message.updated',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ message });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to edit chat message');
    }
  },
  { allowAppSessionAuth: true }
);

export const DELETE = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'create_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const message = await deleteAiChatMessage({
          conversationId: params.conversationId,
          messageId: params.messageId,
          supabase: auth.supabase,
          user: auth.user,
        });

        if (!message) {
          return NextResponse.json(
            { message: 'Message not found' },
            { status: 404 }
          );
        }

        await publishChatRealtimeEvent({
          actorUserId: auth.user.id,
          audience: getChatRealtimeUserAudience(auth.user.id),
          conversationId: message.conversationId,
          message,
          type: 'message.deleted',
          wsId: context.context.normalizedWsId,
        });

        return NextResponse.json({ message });
      }

      // chat_delete_message is the authorization and the delete in one
      // transaction: it requires chat access to this workspace, the message
      // in this conversation of this workspace, and the caller as its sender
      // or holding moderate_chat. The connected site hears of a deletion only
      // after it is committed here, so no one can remove a visitor's message
      // there that they could not delete here.
      const message = await callPrivateChatRpc<ChatMessage | null>(
        'chat_delete_message',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_message_id: params.messageId,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      if (!message) {
        return NextResponse.json(
          { message: 'Message not found' },
          { status: 404 }
        );
      }

      // The deletion stands once committed, so a site that does not accept
      // it is reported beside a 200 rather than as an error: a failure
      // status would tell the client nothing was deleted, and a retry would
      // find the message already gone and never reach the site.
      let externalDelete: 'failed' | undefined;
      try {
        await deleteExternalChatMessageIfBound({
          conversationId: message.conversationId,
          messageId: message.id,
          wsId: context.context.normalizedWsId,
        });
      } catch (error) {
        externalDelete = 'failed';
        console.error('Connected site did not accept a chat deletion', {
          code: error instanceof Error ? error.message : 'unknown',
          messageId: message.id,
        });
      }

      const conversation = await callPrivateChatRpc<ChatConversation | null>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      const body = externalDelete ? { externalDelete, message } : { message };
      if (!conversation) return NextResponse.json(body);

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversationId: message.conversationId,
        message,
        type: 'message.deleted',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json(body);
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to delete chat message');
    }
  },
  { allowAppSessionAuth: true }
);
