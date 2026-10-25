import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  callPrivateChatRpc,
  chatRpcErrorResponse,
  resolveChatRouteContext,
} from '@/lib/chat/private-rpc';

const retirementSchema = z.object({
  opIds: z.array(z.string().uuid()).min(1).max(100),
});

export const POST = withSessionAuth<{ wsId: string }>(
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
    const parsed = retirementSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.error.issues },
        { status: 400 }
      );
    }

    try {
      const { data, error } = await auth.supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', context.context.normalizedWsId)
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

      const result = await callPrivateChatRpc<{ retiredOpIds: string[] }>(
        'chat_retire_reaction_operations',
        {
          p_actor_user_id: auth.user.id,
          p_op_ids: parsed.data.opIds,
        }
      );
      return NextResponse.json(result);
    } catch (error) {
      return chatRpcErrorResponse(error, 'Failed to retire chat reactions');
    }
  },
  { allowAppSessionAuth: true }
);
