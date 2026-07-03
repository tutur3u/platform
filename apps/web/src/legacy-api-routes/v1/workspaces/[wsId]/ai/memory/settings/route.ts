import { AI_MEMORY_PRODUCTS, type AiMemoryProduct } from '@tuturuuu/ai/memory';
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
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const UpdateSettingsSchema = z.object({
  enabled: z.boolean(),
  products: z.record(z.string(), z.boolean()).default({}),
});

type Params = {
  wsId: string;
};

type SettingsRow = {
  enabled?: boolean | null;
  product_enabled?: boolean | null;
  products?: Record<string, boolean> | null;
};

function normalizeProduct(value: string | null): AiMemoryProduct {
  return AI_MEMORY_PRODUCTS.includes(value as AiMemoryProduct)
    ? (value as AiMemoryProduct)
    : 'mira';
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
    serverLogger.warn('Failed to normalize AI memory workspace id', error);
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
    serverLogger.error('Failed to verify AI memory workspace membership', {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { wsId: rawWsId } = await params;
  const context = await resolveMemoryRequestContext(request, rawWsId);
  if (!context.ok) return context.response;

  const product = normalizeProduct(request.nextUrl.searchParams.get('product'));
  const { data, error } = await context.sbAdmin.schema('private').rpc(
    'get_ai_memory_settings' as never,
    {
      p_product: product,
      p_user_id: context.user.id,
      p_ws_id: context.wsId,
    } as never
  );

  if (error) {
    serverLogger.error('Failed to load AI memory settings', {
      error,
      product,
      userId: context.user.id,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to load memory settings' },
      { status: 500 }
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as SettingsRow | null;

  return NextResponse.json({
    enabled: row?.enabled ?? true,
    productEnabled: row?.product_enabled ?? true,
    products: row?.products ?? {},
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { wsId: rawWsId } = await params;
  const context = await resolveMemoryRequestContext(request, rawWsId);
  if (!context.ok) return context.response;

  const parsed = UpdateSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid memory settings payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const allowedProducts = new Set<string>(AI_MEMORY_PRODUCTS);
  const products = Object.fromEntries(
    Object.entries(parsed.data.products).filter(([key]) =>
      allowedProducts.has(key)
    )
  );

  const { data, error } = await context.sbAdmin.schema('private').rpc(
    'upsert_ai_memory_settings' as never,
    {
      p_actor_user_id: context.user.id,
      p_enabled: parsed.data.enabled,
      p_product_settings: products,
      p_user_id: context.user.id,
      p_ws_id: context.wsId,
    } as never
  );

  if (error) {
    serverLogger.error('Failed to update AI memory settings', {
      error,
      userId: context.user.id,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to update memory settings' },
      { status: 500 }
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as SettingsRow | null;

  return NextResponse.json({
    enabled: row?.enabled ?? parsed.data.enabled,
    productEnabled: row?.product_enabled ?? true,
    products: row?.products ?? products,
  });
}
