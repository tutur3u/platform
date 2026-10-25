import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { type SessionAuthContext, withSessionAuth } from '@/lib/api-auth';
import {
  type ChatConversation,
  type ChatMessage,
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';
import {
  getChatRealtimeAudience,
  publishChatRealtimeEvent,
} from '@/lib/chat/realtime';

type RouteParams = {
  conversationId: string;
  wsId: string;
};

const reactionFields = z.object({
  emoji: z.string().trim().min(1).max(64),
  messageId: z.string().uuid(),
});
const desiredReactionSchema = reactionFields.extend({
  opId: z.string().uuid(),
  present: z.boolean(),
});
const legacyReactionSchema = reactionFields.extend({
  opId: z.never().optional(),
  present: z.never().optional(),
});

type DesiredReactionResult = {
  message: ChatMessage;
  operation: {
    id: string;
    emoji: string;
    present: boolean;
  };
};

async function verifyMembership(auth: SessionAuthContext, wsId: string) {
  const { data, error } = await auth.supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) {
    console.error('Failed to verify chat workspace membership', {
      code: error.code,
    });
    return NextResponse.json(
      { message: 'Failed to verify chat workspace membership' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { message: 'Insufficient chat permissions' },
      { status: 403 }
    );
  }
  return null;
}

export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;

    const parsed = z
      .string()
      .uuid()
      .safeParse(new URL(request.url).searchParams.get('messageId'));
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request query', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const membershipError = await verifyMembership(
        auth,
        context.context.normalizedWsId
      );
      if (membershipError) return membershipError;
      const message = await callPrivateChatRpc<ChatMessage | null>(
        'chat_get_reaction_message',
        {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_message_id: parsed.data,
          p_ws_id: context.context.normalizedWsId,
        }
      );
      if (!message) {
        return NextResponse.json(
          { message: 'Chat message not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ message });
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to load chat reaction');
    }
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

function createReactionMutationHandler(
  schema: typeof legacyReactionSchema | typeof desiredReactionSchema
) {
  return withSessionAuth<RouteParams>(
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

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid request body', errors: parsed.error.issues },
          { status: 400 }
        );
      }

      try {
        const membershipError = await verifyMembership(
          auth,
          context.context.normalizedWsId
        );
        if (membershipError) return membershipError;

        const args = {
          p_actor_user_id: auth.user.id,
          p_conversation_id: params.conversationId,
          p_emoji: parsed.data.emoji,
          p_message_id: parsed.data.messageId,
          p_ws_id: context.context.normalizedWsId,
        };
        const result =
          parsed.data.present !== undefined
            ? await callPrivateChatRpc<DesiredReactionResult | null>(
                'chat_set_reaction',
                {
                  ...args,
                  p_op_id: parsed.data.opId,
                  p_present: parsed.data.present,
                }
              )
            : {
                message: await callPrivateChatRpc<ChatMessage | null>(
                  'chat_toggle_reaction',
                  args
                ),
              };
        if (!result?.message) {
          return NextResponse.json(
            { message: 'Chat message not found' },
            { status: 404 }
          );
        }
        const { message } = result;
        const conversation = await callPrivateChatRpc<ChatConversation | null>(
          'chat_get_conversation',
          {
            p_actor_user_id: auth.user.id,
            p_conversation_id: params.conversationId,
            p_ws_id: context.context.normalizedWsId,
          }
        );

        if (conversation) {
          await publishChatRealtimeEvent({
            actorUserId: auth.user.id,
            audience: getChatRealtimeAudience(conversation),
            conversationId: message.conversationId,
            message,
            type: 'reaction.updated',
            wsId: context.context.normalizedWsId,
          });
        }

        return NextResponse.json(result);
      } catch (error) {
        return chatRpcErrorResponse(error, 'Failed to update chat reaction');
      }
    },
    { allowAppSessionAuth: true }
  );
}

export const POST = createReactionMutationHandler(legacyReactionSchema);
export const PUT = createReactionMutationHandler(desiredReactionSchema);
