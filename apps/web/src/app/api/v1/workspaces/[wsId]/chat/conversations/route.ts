import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { listAiAgentExternalThreadConversations } from '@/lib/ai-agents/external-chat-mirror';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
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

const MAX_COMBINED_CONVERSATION_OFFSET = 1000;

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
  limit,
  offset,
  wsId,
}: {
  actorUserId: string;
  archived: 'active' | 'all' | 'archived';
  limit?: number | null;
  offset?: number | null;
  wsId: string;
}) {
  try {
    return await callPrivateChatRpc<ChatConversation[]>(
      'chat_list_conversations',
      {
        p_actor_user_id: actorUserId,
        p_archived: archived,
        p_limit: limit ?? null,
        p_offset: offset ?? 0,
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

async function listNativeConversationsByRecency({
  actorUserId,
  archived,
  limit,
  wsId,
}: {
  actorUserId: string;
  archived: 'active' | 'all' | 'archived';
  limit: number;
  wsId: string;
}) {
  try {
    return await callPrivateChatRpc<ChatConversation[]>(
      'chat_list_conversations_by_recency',
      {
        p_actor_user_id: actorUserId,
        p_archived: archived,
        p_limit: limit,
        p_ws_id: wsId,
      }
    );
  } catch (error) {
    if (!isMissingChatRpc(error, 'chat_list_conversations_by_recency')) {
      throw error;
    }

    const conversations = await listNativeChatConversations({
      actorUserId,
      archived,
      limit: null,
      offset: 0,
      wsId,
    });
    return conversations.sort(compareConversationsByRecency).slice(0, limit);
  }
}

async function canIncludeAiAgentAdminMetadata({
  actorUser,
  wsId,
}: {
  actorUser: SessionAuthContext['user'];
  wsId: string;
}) {
  if (wsId !== ROOT_WORKSPACE_ID) {
    return false;
  }

  const permissions = await getPermissions({
    user: actorUser,
    wsId: ROOT_WORKSPACE_ID,
  });

  return Boolean(permissions?.permissions.includes('manage_workspace_secrets'));
}

function isMissingArchivedChatListRpc(error: unknown) {
  const rpcError = error as { code?: string; message?: string };
  if (rpcError.code === 'PGRST202' || rpcError.code === '42883') return true;

  const message = rpcError.message ?? '';
  return (
    message.includes('chat_list_conversations') &&
    (/p_archived/u.test(message) || /schema cache/u.test(message))
  );
}

function isMissingChatRpc(error: unknown, functionName: string) {
  const rpcError = error as { code?: string; message?: string };
  const message = rpcError.message ?? '';

  return (
    rpcError.code === 'PGRST202' ||
    rpcError.code === '42883' ||
    (message.includes(functionName) && /schema cache/u.test(message))
  );
}

function readPagination(url: URL) {
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const isPaginated = limitParam !== null || offsetParam !== null;
  const parsedLimit = Number(limitParam ?? 40);
  const parsedOffset = Number(offsetParam ?? 0);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100)
    : 40;
  const offset = Number.isFinite(parsedOffset)
    ? Math.max(Math.trunc(parsedOffset), 0)
    : 0;

  return { isPaginated, limit, offset };
}

async function listExternalChatConversations({
  actorUserId,
  archived,
  limit,
  offset,
  wsId,
}: {
  actorUserId: string;
  archived: 'active' | 'all' | 'archived';
  limit: number;
  offset: number;
  wsId: string;
}) {
  return await callPrivateChatRpc<ChatConversation[]>(
    'external_chat_list_conversations',
    {
      p_actor_user_id: actorUserId,
      p_archived: archived,
      p_limit: limit,
      p_offset: offset,
      p_ws_id: wsId,
    }
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
    const scope =
      url.searchParams.get('scope') === 'external' ? 'external' : null;
    const pagination = readPagination(url);

    try {
      if (scope === 'external') {
        const conversations = await listExternalChatConversations({
          actorUserId: auth.user.id,
          archived,
          limit: pagination.limit + 1,
          offset: pagination.offset,
          wsId: context.context.normalizedWsId,
        });
        const hasNextPage = conversations.length > pagination.limit;

        return NextResponse.json({
          conversations: conversations.slice(0, pagination.limit),
          nextOffset: hasNextPage ? pagination.offset + pagination.limit : null,
        });
      }

      const includeAiAgentAdminMetadata = await canIncludeAiAgentAdminMetadata({
        actorUser: auth.user,
        wsId: context.context.normalizedWsId,
      });
      if (
        pagination.isPaginated &&
        pagination.offset > MAX_COMBINED_CONVERSATION_OFFSET
      ) {
        return NextResponse.json(
          {
            code: 'chat_pagination_offset_too_large',
            message: 'Conversation offset is too large.',
          },
          { status: 400 }
        );
      }
      const sourcePrefixLength = pagination.offset + pagination.limit + 1;

      const [
        conversations,
        aiAgentConversations,
        aiAgentExternalConversations,
        aiChatConversations,
      ] = await Promise.all([
        pagination.isPaginated
          ? listNativeConversationsByRecency({
              actorUserId: auth.user.id,
              archived,
              limit: sourcePrefixLength,
              wsId: context.context.normalizedWsId,
            })
          : listNativeChatConversations({
              actorUserId: auth.user.id,
              archived,
              limit: null,
              offset: 0,
              wsId: context.context.normalizedWsId,
            }),
        archived === 'active'
          ? listRootAiAgentDiscoveryConversations({
              includeAdminMetadata: includeAiAgentAdminMetadata,
              wsId: context.context.normalizedWsId,
            })
          : [],
        archived === 'active'
          ? listAiAgentExternalThreadConversations({
              actorUserId: auth.user.id,
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

      const allConversations = [
        ...(conversations ?? []),
        ...aiAgentConversations,
        ...aiAgentExternalConversations,
        ...aiChatConversations,
      ].sort(compareConversationsByRecency);
      if (!pagination.isPaginated) {
        return NextResponse.json({
          conversations: allConversations,
          nextOffset: null,
        });
      }
      const pageEnd = pagination.offset + pagination.limit;
      const hasNextPage = allConversations.length > pageEnd;
      return NextResponse.json({
        conversations: allConversations.slice(pagination.offset, pageEnd),
        nextOffset: hasNextPage ? pageEnd : null,
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load chat conversations');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

function compareConversationsByRecency(
  left: ChatConversation,
  right: ChatConversation
) {
  const updatedDifference =
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  return updatedDifference || left.id.localeCompare(right.id);
}

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
