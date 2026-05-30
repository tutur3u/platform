import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  listAiChatConversations,
  listRootAiAgentDiscoveryConversations,
} from '@/lib/chat/agent-discovery';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  getChatRealtimeAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';

type RouteParams = {
  wsId: string;
};

const createConversationSchema = z.object({
  aiEnabled: z.boolean().optional(),
  autoReply: z.boolean().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  modelId: z.string().trim().max(255).nullable().optional(),
  participantUserIds: z.array(z.string().uuid()).max(50).optional(),
  systemPrompt: z.string().trim().max(10000).nullable().optional(),
  title: z.string().trim().max(255).nullable().optional(),
  type: z.enum(['direct', 'group', 'channel', 'ai']).default('channel'),
});

async function listNativeChatConversations({
  actorUserId,
  archived,
  wsId,
}: {
  actorUserId: string;
  archived: 'active' | 'all' | 'archived';
  wsId: string;
}) {
  try {
    return await callPrivateChatRpc<ChatConversation[]>(
      'chat_list_conversations',
      {
        p_actor_user_id: actorUserId,
        p_archived: archived,
        p_ws_id: wsId,
      }
    );
  } catch (error) {
    if (!isMissingArchivedChatListRpc(error)) {
      throw error;
    }

    if (archived === 'archived') {
      return [];
    }

    return await callPrivateChatRpc<ChatConversation[]>(
      'chat_list_conversations',
      {
        p_actor_user_id: actorUserId,
        p_ws_id: wsId,
      }
    );
  }
}

function isMissingArchivedChatListRpc(error: unknown) {
  const rpcError = error as { code?: string; message?: string };
  const message = rpcError.message ?? '';

  return (
    rpcError.code === 'PGRST202' ||
    rpcError.code === '42883' ||
    (/chat_list_conversations/u.test(message) &&
      (/p_archived/u.test(message) || /schema cache/u.test(message)))
  );
}

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const url = new URL(request.url);
    const archivedParam = url.searchParams.get('archived');
    const archived =
      archivedParam === 'archived' || archivedParam === 'all'
        ? archivedParam
        : 'active';

    try {
      const [conversations, aiAgentConversations, aiChatConversations] =
        await Promise.all([
          listNativeChatConversations({
            actorUserId: auth.user.id,
            archived,
            wsId: context.context.normalizedWsId,
          }),
          archived === 'active'
            ? listRootAiAgentDiscoveryConversations({
                wsId: context.context.normalizedWsId,
              })
            : [],
          listAiChatConversations({
            archived,
            supabase: auth.supabase,
            user: auth.user,
            wsId: context.context.normalizedWsId,
          }),
        ]);

      return NextResponse.json({
        conversations: [
          ...(conversations ?? []),
          ...aiAgentConversations,
          ...aiChatConversations,
        ],
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load chat conversations');
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

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = createConversationSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const conversation = await callPrivateChatRpc<ChatConversation>(
        'chat_create_conversation',
        {
          p_actor_user_id: auth.user.id,
          p_input: parsed.data,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      await publishChatRealtimeEvent({
        actorUserId: auth.user.id,
        audience: getChatRealtimeAudience(conversation),
        conversation,
        conversationId: conversation.id,
        type: 'conversation.created',
        wsId: context.context.normalizedWsId,
      });

      return NextResponse.json({ conversation }, { status: 201 });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to create chat conversation');
    }
  },
  { allowAppSessionAuth: true }
);
