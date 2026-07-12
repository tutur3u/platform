import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import {
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
    indicatorId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const { wsId, indicatorId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('update_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage indicators' },
      { status: 403 }
    );
  }

  const {
    name,
    factor,
    unit,
    categoryIds,
    isWeighted = true,
  } = await req.json();

  const sbAdmin = await createAdminClient();

  const actorAuthUid = await resolveRequestActorAuthUid(req);
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('admin_update_user_group_metric_with_audit_actor', {
      p_actor_auth_uid: actorAuthUid ?? undefined,
      p_category_ids: Array.isArray(categoryIds) ? categoryIds : undefined,
      p_metric_id: indicatorId,
      p_payload: {
        factor,
        is_weighted: isWeighted !== false,
        name,
        unit,
      },
      p_ws_id: normalizedWsId,
    });

  if (error) {
    console.error('Error updating group indicator:', error);
    return NextResponse.json(
      { message: 'Error updating indicator' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Indicator not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, indicatorId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getUserGroupRoutePermissions(wsId, req);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('delete_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage indicators' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  // Instead of deleting, we set group_id to null as per original logic
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('admin_update_user_group_metric_with_audit_actor', {
      p_actor_auth_uid: actorAuthUid ?? undefined,
      p_category_ids: undefined,
      p_metric_id: indicatorId,
      p_payload: {
        group_id: null,
      },
      p_ws_id: normalizedWsId,
    });

  if (error) {
    console.error('Error deleting group indicator:', error);
    return NextResponse.json(
      { message: 'Error deleting indicator' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'Indicator not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
