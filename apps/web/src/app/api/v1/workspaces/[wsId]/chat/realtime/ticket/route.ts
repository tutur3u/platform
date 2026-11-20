import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  callPrivateChatRpc,
  type ChatConversation,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import { createChatRealtimeSubscribeTicket } from '@/lib/chat/realtime-worker';

type RouteParams = { wsId: string };
const conversationIdSchema = z.uuid().nullable();
const privateHeaders = { 'Cache-Control': 'private, no-store' };

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    await connection();

    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const parsed = conversationIdSchema.safeParse(
      request.nextUrl.searchParams.get('conversationId')
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid chat conversation ID' },
        { status: 400, headers: privateHeaders }
      );
    }

    let conversationId = parsed.data;
    const wsId = context.context.normalizedWsId;
    let roomWorkspaceId = wsId;
    if (conversationId) {
      try {
        const conversation = await callPrivateChatRpc<ChatConversation | null>(
          'chat_get_conversation',
          {
            p_actor_user_id: auth.user.id,
            p_conversation_id: conversationId,
            p_ws_id: wsId,
          }
        );
        if (!conversation) {
          return NextResponse.json(
            { message: 'Chat conversation not found' },
            { status: 404, headers: privateHeaders }
          );
        }
        conversationId = conversation.id;
        roomWorkspaceId = conversation.wsId;
      } catch (error) {
        return chatRpcErrorResponse(error, 'Failed to verify chat access');
      }
    }

    try {
      const ticket = await createChatRealtimeSubscribeTicket({
        conversationId: conversationId ?? undefined,
        userId: auth.user.id,
        wsId: roomWorkspaceId,
      });
      return NextResponse.json(
        ticket ? { enabled: true, ...ticket } : { enabled: false },
        { headers: privateHeaders }
      );
    } catch (error) {
      console.error('Chat realtime ticket unavailable', { error, wsId });
      return NextResponse.json({ enabled: false }, { headers: privateHeaders });
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);
