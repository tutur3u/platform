import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { connection, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  await connection();

  const { wsId: rawWsId } = await params;
  const permissions = await getUserGroupRoutePermissions(rawWsId, request);

  if (!permissions) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to link promotions' },
      { status: 403 }
    );
  }

  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .schema('private')
    .from('workspace_promotions')
    .select(
      'id, name, description, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id'
    )
    .eq('ws_id', wsId)
    .order('code', { ascending: true });

  if (error) {
    console.error('Error fetching Contacts workspace promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
