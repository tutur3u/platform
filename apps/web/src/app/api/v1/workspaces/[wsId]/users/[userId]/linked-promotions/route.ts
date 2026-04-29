import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await sbAdmin
    .from('user_linked_promotions')
    .select(
      'promo_id, workspace_promotions!inner(id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id)'
    )
    .eq('user_id', userId)
    .eq('workspace_promotions.ws_id', wsId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching linked promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const schema = z.object({
    promoId: z.guid(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { promoId } = parsed.data;

  // Verify promotion belongs to workspace
  const { data: promo, error: promoError } = await sbAdmin
    .from('workspace_promotions')
    .select('id')
    .eq('id', promoId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (promoError || !promo) {
    return NextResponse.json(
      { message: 'Promotion not found' },
      { status: 404 }
    );
  }

  const { error } = await sbAdmin.from('user_linked_promotions').insert({
    user_id: userId,
    promo_id: promoId,
  });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error linking promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const promoId = searchParams.get('promoId');

  if (!promoId) {
    return NextResponse.json(
      { message: 'Missing promoId parameter' },
      { status: 400 }
    );
  }

  const { error } = await sbAdmin
    .from('user_linked_promotions')
    .delete()
    .eq('user_id', userId)
    .eq('promo_id', promoId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error unlinking promotion' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
