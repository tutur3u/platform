import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(req: Request, { params }: Params) {
  const { wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { containsPermission } = permissions;
  if (!containsPermission('create_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage metric categories' },
      { status: 403 }
    );
  }

  const { name, description } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ message: 'Name is required' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .schema('private')
    .from('user_group_metric_categories')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      ws_id: normalizedWsId,
    })
    .select('id, name, description')
    .single();

  if (error) {
    console.error('Error creating metric category:', error);
    return NextResponse.json(
      { message: 'Error creating metric category' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
