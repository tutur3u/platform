import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { VitalGroup } from '@tuturuuu/types/primitives/VitalGroup';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveUserGroupRouteWorkspaceId } from '@/lib/user-groups/route-helpers';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const data = await req.json();
  const { wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ wsId, request: req });
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

  const supabase = await createAdminClient();
  const { error } = await supabase
    .schema('private')
    // .from('workspace_indicators')
    .from('user_group_metric_categories')
    .upsert(
      (data?.groups || []).map((u: VitalGroup) => ({
        ...u,
        ws_id: normalizedWsId,
      }))
    )
    .eq('id', data.id);

  if (error)
    return NextResponse.json(
      { message: 'Error migrating workspace indicator groups' },
      { status: 500 }
    );

  return NextResponse.json({ message: 'success' });
}
