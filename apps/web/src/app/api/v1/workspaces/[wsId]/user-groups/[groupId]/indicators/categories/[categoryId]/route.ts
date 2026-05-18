import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    categoryId: string;
    groupId: string;
    wsId: string;
  }>;
}

export async function DELETE(req: Request, { params }: Params) {
  const { categoryId, groupId, wsId } = await params;

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

  const [groupResult, categoryResult] = await Promise.all([
    sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', groupId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    sbAdmin
      .from('user_group_metric_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('ws_id', wsId)
      .maybeSingle(),
  ]);

  const { data: group, error: groupError } = groupResult;
  const { data: category, error: categoryError } = categoryResult;

  if (groupError) {
    serverLogger.error('Failed to resolve user group for metric deletion', {
      error: groupError,
      groupId,
      wsId,
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
    serverLogger.error('Failed to resolve metric category for deletion', {
      categoryId,
      error: categoryError,
      wsId,
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

  const { error: linkDeleteError } = await sbAdmin
    .from('user_group_metric_category_links')
    .delete()
    .eq('category_id', categoryId);

  if (linkDeleteError) {
    serverLogger.error('Failed to unlink metric category before deletion', {
      categoryId,
      error: linkDeleteError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error deleting metric category' },
      { status: 500 }
    );
  }

  const { error: deleteError } = await sbAdmin
    .from('user_group_metric_categories')
    .delete()
    .eq('id', categoryId)
    .eq('ws_id', wsId);

  if (deleteError) {
    serverLogger.error('Failed to delete metric category', {
      categoryId,
      error: deleteError,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error deleting metric category' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
