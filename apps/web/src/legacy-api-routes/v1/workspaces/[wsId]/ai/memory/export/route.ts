import {
  AI_MEMORY_PRODUCTS,
  type AiMemoryProduct,
  listAiMemories,
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
import { serverLogger } from '@/lib/infrastructure/log-drain';

type Params = {
  wsId: string;
};

function normalizeProduct(value: string | null): AiMemoryProduct {
  return AI_MEMORY_PRODUCTS.includes(value as AiMemoryProduct)
    ? (value as AiMemoryProduct)
    : 'mira';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { wsId: rawWsId } = await params;
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sbAdmin = await createAdminClient();
  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase, request);
  } catch (error) {
    serverLogger.warn(
      'Failed to normalize AI memory export workspace id',
      error
    );
    return NextResponse.json(
      { error: 'Invalid workspace identifier' },
      { status: 422 }
    );
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: sbAdmin,
    userId: user.id,
    wsId,
  });
  if (membership.error === 'membership_lookup_failed') {
    serverLogger.error('Failed to verify AI memory export workspace access', {
      userId: user.id,
      wsId,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
  if (!membership.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const product = normalizeProduct(request.nextUrl.searchParams.get('product'));
  const scope = resolveAiMemoryScope({
    customId: `memory-export-${product}`,
    product,
    source: 'memory_controls',
    surface: 'memory_controls',
    userId: user.id,
    wsId,
  });
  const result = await listAiMemories({
    ignoreSettings: true,
    limit: 500,
    scope,
  });

  if (!result.ok) {
    serverLogger.error('Failed to export AI memories', {
      error: result.error,
      product,
      userId: user.id,
      wsId,
    });
    return NextResponse.json(
      { error: 'Failed to export memories' },
      { status: 500 }
    );
  }

  const items = result.value ?? [];

  await sbAdmin.schema('private').rpc(
    'record_ai_memory_audit' as never,
    {
      p_action: 'export',
      p_actor_user_id: user.id,
      p_memory_id: null,
      p_metadata: { count: items.length },
      p_product: product,
      p_user_id: user.id,
      p_ws_id: wsId,
    } as never
  );

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    items,
    product,
    total: items.length,
  });
}
