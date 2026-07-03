import {
  AI_MEMORY_PRODUCTS,
  type AiMemoryProduct,
  listAiMemories,
  rememberAiMemory,
  resolveAiMemoryScope,
  searchAiMemories,
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
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type Params = {
  wsId: string;
};

function normalizeProduct(value: string | null): AiMemoryProduct {
  return AI_MEMORY_PRODUCTS.includes(value as AiMemoryProduct)
    ? (value as AiMemoryProduct)
    : 'memories';
}

const createMemoryItemSchema = z.object({
  category: z.string().trim().min(1).max(80).optional(),
  key: z.string().trim().max(160).optional(),
  product: z.string().trim().optional(),
  source: z.string().trim().max(120).optional(),
  value: z.string().trim().min(1).max(16_000),
});

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
    serverLogger.warn(
      'Failed to normalize AI memory items workspace id',
      error
    );
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
    serverLogger.error('Failed to verify AI memory items workspace access', {
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
  const category = request.nextUrl.searchParams.get('category');
  const query = request.nextUrl.searchParams.get('q')?.trim();
  const limit = Math.min(
    Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '100', 10) ||
      100,
    500
  );
  const scope = resolveAiMemoryScope({
    customId: `memory-items-${product}`,
    product,
    source: 'memory_controls',
    surface: 'memory_controls',
    userId: context.user.id,
    wsId: context.wsId,
  });

  const result = query
    ? await searchAiMemories({
        category,
        ignoreSettings: true,
        includeProductFilter: true,
        limit,
        query,
        scope,
      })
    : await listAiMemories({
        category,
        ignoreSettings: true,
        limit,
        scope,
      });

  if (!result.ok) {
    serverLogger.error('Failed to load AI memory items', {
      error: result.error,
      product,
      userId: context.user.id,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to load memory items' },
      { status: 500 }
    );
  }

  const items = result.value ?? [];

  return NextResponse.json({
    items,
    product,
    total: items.length,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { wsId: rawWsId } = await params;
  const context = await resolveMemoryRequestContext(request, rawWsId);
  if (!context.ok) return context.response;

  const parsed = createMemoryItemSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { details: parsed.error.issues, error: 'Invalid request data' },
      { status: 400 }
    );
  }

  const product = normalizeProduct(parsed.data.product ?? null);
  const category = parsed.data.category || null;
  const key = parsed.data.key || null;
  const source = parsed.data.source || 'memory_explorer';
  const scope = resolveAiMemoryScope({
    customId: `memory-explorer-${product}-${Date.now()}`,
    metadata: { source },
    product,
    source,
    surface: 'memory_explorer',
    userId: context.user.id,
    wsId: context.wsId,
  });

  const result = await rememberAiMemory({
    category,
    ignoreSettings: true,
    key,
    scope,
    value: parsed.data.value,
  });

  if (!result.ok) {
    serverLogger.error('Failed to create AI memory item', {
      error: result.error,
      product,
      userId: context.user.id,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to create memory item' },
      { status: 500 }
    );
  }

  if (result.skipped) {
    return NextResponse.json({
      memory: null,
      product,
      reason: result.reason,
      skipped: true,
    });
  }

  return NextResponse.json({
    memory: result.value,
    product,
    skipped: false,
  });
}
