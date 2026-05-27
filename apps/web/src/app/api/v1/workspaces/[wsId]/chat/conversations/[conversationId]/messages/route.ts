import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  type ChatMessage,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const attachmentSchema = z.object({
  contentType: z.string().max(255).nullable().optional(),
  filename: z.string().trim().min(1).max(255),
  fullPath: z.string().max(1200).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  path: z.string().trim().min(1).max(1024),
  sizeBytes: z.number().int().min(0).max(104857600).nullable().optional(),
});

const createMessageSchema = z.object({
  attachments: z.array(attachmentSchema).max(20).optional(),
  content: z.string().max(10000).default(''),
  kind: z.enum(['user', 'assistant', 'system']).default('user'),
  replyToMessageId: z.string().uuid().nullable().optional(),
});

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') ?? 60);
    const before = url.searchParams.get('before');

    try {
      const messages = await callPrivateChatRpc<ChatMessage[]>(
        'chat_list_messages',
        {
          p_actor_user_id: auth.user.id,
          p_before: before || null,
          p_conversation_id: params.conversationId,
          p_limit: Number.isFinite(limit) ? limit : 60,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ messages: messages ?? [] });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load chat messages');
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

    const parsed = createMessageSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const message = await callPrivateChatRpc<ChatMessage>(
        'chat_send_message',
        {
          p_actor_user_id: auth.user.id,
          p_attachments: parsed.data.attachments ?? [],
          p_content: parsed.data.content,
          p_conversation_id: params.conversationId,
          p_kind: parsed.data.kind,
          p_reply_to_message_id: parsed.data.replyToMessageId ?? null,
          p_ws_id: context.context.normalizedWsId,
        }
      );

      return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to send chat message');
    }
  },
  { allowAppSessionAuth: true }
);
