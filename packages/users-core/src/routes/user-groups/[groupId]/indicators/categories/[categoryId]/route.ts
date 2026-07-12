import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    categoryId: string;
    groupId: string;
    wsId: string;
  }>;
}

export async function DELETE(req: Request, { params }: Params) {
  const { categoryId, groupId, wsId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { containsPermission } = permissions;
  if (!containsPermission('delete_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage metric categories' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const metricCategories = sbAdmin.schema('private');

  const [groupResult, categoryResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', groupId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle(),
    metricCategories
      .from('user_group_metric_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle(),
  ]);

  const { data: group, error: groupError } = groupResult;
  const { data: category, error: categoryError } = categoryResult;

  if (groupError) {
    console.error('Failed to resolve user group for metric deletion', {
      error: groupError,
      groupId,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error deleting metric category' },
      { status: 500 }
    );
  }

  if (!group) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  if (categoryError) {
    console.error('Failed to resolve metric category for deletion', {
      categoryId,
      error: categoryError,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error deleting metric category' },
      { status: 500 }
    );
  }

  if (!category) {
    return NextResponse.json(
      { message: 'Metric category not found' },
      { status: 404 }
    );
  }

  const { error: linkDeleteError } = await metricCategories
    .from('user_group_metric_category_links')
    .delete()
    .eq('category_id', categoryId);

  if (linkDeleteError) {
    console.error('Failed to unlink metric category before deletion', {
      categoryId,
      error: linkDeleteError,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error deleting metric category' },
      { status: 500 }
    );
  }

  const { error: deleteError } = await metricCategories
    .from('user_group_metric_categories')
    .delete()
    .eq('id', categoryId)
    .eq('ws_id', normalizedWsId);

  if (deleteError) {
    console.error('Failed to delete metric category', {
      categoryId,
      error: deleteError,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Error deleting metric category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
