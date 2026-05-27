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

export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    try {
      const conversations = await callPrivateChatRpc<ChatConversation[]>(
        'chat_list_conversations',
        {
          p_actor_user_id: auth.user.id,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ conversations: conversations ?? [] });
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
      permission: 'create_chat',
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

      return NextResponse.json({ conversation }, { status: 201 });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to create chat conversation');
    }
  },
  { allowAppSessionAuth: true }
);
