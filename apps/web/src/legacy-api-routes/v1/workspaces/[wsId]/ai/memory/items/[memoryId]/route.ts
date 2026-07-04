import {
  AI_MEMORY_PRODUCTS,
  type AiMemoryProduct,
  forgetAiMemory,
  resolveAiMemoryScope,
} from '@tuturuuu/ai/memory';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

type Params = {
  memoryId: string;
  wsId: string;
};

function normalizeProduct(value: string | null): AiMemoryProduct {
  return AI_MEMORY_PRODUCTS.includes(value as AiMemoryProduct)
    ? (value as AiMemoryProduct)
    : 'memories';
}

async function resolveMemoryRequestContext(
  request: NextRequest,
  rawWsId: string
) {
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const sbAdmin = await createAdminClient();
  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase, request);
  } catch (error) {
    console.warn('Failed to normalize AI memory delete workspace id', error);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Invalid workspace identifier' },
        { status: 422 }
      ),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: sbAdmin,
    userId: user.id,
    wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    console.error('Failed to verify AI memory delete workspace access', {
      userId: user.id,
      wsId,
    });
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const, sbAdmin, user, wsId };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { memoryId, wsId: rawWsId } = await params;
  const context = await resolveMemoryRequestContext(request, rawWsId);
  if (!context.ok) return context.response;

  const product = normalizeProduct(request.nextUrl.searchParams.get('product'));
  const scope = resolveAiMemoryScope({
    customId: `memory-delete-${memoryId}`,
    product,
    source: 'memory_controls',
    surface: 'memory_controls',
    userId: context.user.id,
    wsId: context.wsId,
  });

  const result = await forgetAiMemory({
    ignoreSettings: true,
    memoryId,
    scope,
  });

  if (!result.ok) {
    console.error('Failed to delete AI memory item', {
      error: result.error,
      memoryId,
      product,
      userId: context.user.id,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to delete memory item' },
      { status: 500 }
    );
  }

  await context.sbAdmin.schema('private').rpc(
    'record_ai_memory_audit' as never,
    {
      p_action: 'delete',
      p_actor_user_id: context.user.id,
      p_memory_id: memoryId,
      p_metadata: { ai_memory: result.value ?? null },
      p_product: product,
      p_user_id: context.user.id,
      p_ws_id: context.wsId,
    } as never
  );

  return NextResponse.json({
    deleted: !result.skipped,
    reason: result.skipped ? result.reason : null,
  });
}
