import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    userId: string;
    wsId: string;
  }>;
}

const PromotionLinkSchema = z.object({
  promoId: z.guid(),
});

async function hasWorkspaceUser(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  const { data, error } = await sbAdmin
    .from('workspace_users')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function hasWorkspacePromotion(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  promoId: string
) {
  const { data, error } = await sbAdmin
    .schema('private')
    .from('workspace_promotions')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', promoId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function resolveRequestContext(
  request: Request,
  params: Params['params']
) {
  const { userId, wsId: rawWsId } = await params;
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);

  if (!permissions) return null;

  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const sbAdmin = await createAdminClient({ noCookie: true });

  return { permissions, sbAdmin, userId, wsId };
}

export async function GET(request: Request, { params }: Params) {
  await connection();

  const context = await resolveRequestContext(request, params);
  if (!context) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const { permissions, sbAdmin, userId, wsId } = context;
  if (!permissions.containsPermission('view_users_private_info')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view linked promotions' },
      { status: 403 }
    );
  }

  try {
    if (!(await hasWorkspaceUser(sbAdmin, wsId, userId))) {
      return NextResponse.json(
        { message: 'Workspace user not found' },
        { status: 404 }
      );
    }

    const privateDb = sbAdmin.schema('private');
    const { data: links, error } = await privateDb
      .from('user_linked_promotions')
      .select('promo_id')
      .eq('user_id', userId);

    if (error) throw error;

    const promoIds = [...new Set((links ?? []).map((link) => link.promo_id))];
    if (promoIds.length === 0) return NextResponse.json([]);

    const { data: promotions, error: promotionsError } = await privateDb
      .from('workspace_promotions')
      .select(
        'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id'
      )
      .eq('ws_id', wsId)
      .in('id', promoIds);

    if (promotionsError) throw promotionsError;

    const promotionsById = new Map(
      (promotions ?? []).map((promotion) => [promotion.id, promotion])
    );

    return NextResponse.json(
      (links ?? [])
        .map((link) => ({
          promo_id: link.promo_id,
          workspace_promotions: promotionsById.get(link.promo_id) ?? null,
        }))
        .filter((link) => link.workspace_promotions)
    );
  } catch (error) {
    console.error('Error fetching Contacts user linked promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching linked promotions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  await connection();

  const context = await resolveRequestContext(request, params);
  if (!context) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const { permissions, sbAdmin, userId, wsId } = context;
  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = PromotionLinkSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    const { promoId } = parsed.data;
    const [userExists, promotionExists] = await Promise.all([
      hasWorkspaceUser(sbAdmin, wsId, userId),
      hasWorkspacePromotion(sbAdmin, wsId, promoId),
    ]);

    if (!userExists) {
      return NextResponse.json(
        { message: 'Workspace user not found' },
        { status: 404 }
      );
    }
    if (!promotionExists) {
      return NextResponse.json(
        { message: 'Promotion not found' },
        { status: 404 }
      );
    }

    const { error } = await sbAdmin
      .schema('private')
      .from('user_linked_promotions')
      .upsert(
        { user_id: userId, promo_id: promoId },
        { ignoreDuplicates: true, onConflict: 'user_id,promo_id' }
      );

    if (error) throw error;
    return NextResponse.json({ message: 'success' });
  } catch (error) {
    console.error('Error linking Contacts user promotion:', error);
    return NextResponse.json(
      { message: 'Error linking promotion' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  await connection();

  const context = await resolveRequestContext(request, params);
  if (!context) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const { permissions, sbAdmin, userId, wsId } = context;
  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const promoId = new URL(request.url).searchParams.get('promoId');
  const parsed = z.guid().safeParse(promoId);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid promoId parameter' },
      { status: 400 }
    );
  }

  try {
    const [userExists, promotionExists] = await Promise.all([
      hasWorkspaceUser(sbAdmin, wsId, userId),
      hasWorkspacePromotion(sbAdmin, wsId, parsed.data),
    ]);

    if (!userExists || !promotionExists) {
      return NextResponse.json(
        { message: 'Promotion link not found' },
        { status: 404 }
      );
    }

    const { error } = await sbAdmin
      .schema('private')
      .from('user_linked_promotions')
      .delete()
      .eq('user_id', userId)
      .eq('promo_id', parsed.data);

    if (error) throw error;
    return NextResponse.json({ message: 'success' });
  } catch (error) {
    console.error('Error unlinking Contacts user promotion:', error);
    return NextResponse.json(
      { message: 'Error unlinking promotion' },
      { status: 500 }
    );
  }
}
