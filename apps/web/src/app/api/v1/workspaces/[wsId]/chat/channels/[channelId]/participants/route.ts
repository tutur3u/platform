import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  channelId: string;
  wsId: string;
};

const participantSchema = z.object({
  last_read_at: z.string().datetime().optional(),
});

function toLegacyParticipant(conversation: ChatConversation) {
  return conversation.members.map((member) => ({
    channel_id: member.conversationId,
    last_read_at: member.lastReadAt,
    user_id: member.userId,
  }));
}

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const conversation = await callPrivateChatRpc<ChatConversation | null>(
        'chat_get_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.channelId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({
        participants: conversation ? toLegacyParticipant(conversation) : [],
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load participants');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const payload = await request.json().catch(() => ({}));
    const parsed = participantSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      await callPrivateChatRpc<ChatConversation | null>('chat_set_read_state', {
        p_actor_user_id: auth.user.id,
        p_conversation_id: params.channelId,
        p_message_id: null,
        p_ws_id: context.context.normalizedWsId,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to update participant');
    }
  },
  { allowAppSessionAuth: true }
);
