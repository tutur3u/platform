import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  canAccessAiChatConversation,
  isAiChatConversationId,
  listAiChatSharedContent,
} from '@/lib/chat/agent-discovery';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      if (isAiChatConversationId(params.conversationId)) {
        const canAccess = await canAccessAiChatConversation({
          conversationId: params.conversationId,
          supabase: auth.supabase,
          userId: auth.user.id,
        });

        if (!canAccess) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }

        const sharedContent = await listAiChatSharedContent({
          conversationId: params.conversationId,
          supabase: auth.supabase,
          user: auth.user,
          wsId: context.context.normalizedWsId,
        });

        if (!sharedContent) {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }

        return NextResponse.json({ sharedContent });
      }

      const sharedContent = await callPrivateChatRpc(
        'chat_list_shared_content',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ sharedContent });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load shared content');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);
