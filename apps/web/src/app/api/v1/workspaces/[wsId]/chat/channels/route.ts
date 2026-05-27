import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatConversation,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
  toLegacyChannel,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  wsId: string;
};

const createChannelSchema = z.object({
  description: z.string().trim().max(2000).nullable().optional(),
  name: z.string().trim().min(1).max(255),
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

      return NextResponse.json({
        channels: (conversations ?? []).map(toLegacyChannel),
      });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load channels');
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

    const parsed = createChannelSchema.safeParse(payload);
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
          p_input: {
            description: parsed.data.description ?? null,
            title: parsed.data.name,
            type: 'channel',
          },
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json(
        { channel: toLegacyChannel(conversation) },
        { status: 201 }
      );
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to create channel');
    }
  },
  { allowAppSessionAuth: true }
);
