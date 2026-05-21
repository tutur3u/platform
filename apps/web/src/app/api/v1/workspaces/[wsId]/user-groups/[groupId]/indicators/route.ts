import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import type { MetricCategory } from '@/app/[locale]/(dashboard)/[wsId]/users/groups/[groupId]/indicators/types';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  hasUserGroupInWorkspace,
  resolveRequestActorAuthUid,
  resolveUserGroupRouteWorkspaceId,
} from '@/lib/user-groups/route-helpers';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

function mapMetricCategories(
  metricCategoryLinks:
    | {
        user_group_metric_categories: MetricCategory | MetricCategory[] | null;
      }[]
    | null
    | undefined
) {
  return (metricCategoryLinks ?? [])
    .flatMap((row) => row.user_group_metric_categories ?? [])
    .filter((category): category is MetricCategory => Boolean(category));
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view group indicators' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  if (
    !(await hasUserGroupInWorkspace({
      sbAdmin,
      wsId: normalizedWsId,
      groupId,
    }))
  ) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  // Fetch group indicators
  const { data: groupIndicators, error: indicatorsError } = await sbAdmin
    .from('user_group_metrics')
    .select(`
      id,
      name,
      factor,
      unit,
      is_weighted,
      user_group_metric_category_links(
        user_group_metric_categories(id, name, description)
      )
    `)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });

  if (indicatorsError) {
    serverLogger.error('Error fetching group indicators:', indicatorsError);
    return NextResponse.json(
      { message: 'Error fetching group indicators' },
      { status: 500 }
    );
  }

  const { data: metricCategories, error: metricCategoriesError } = await sbAdmin
    .from('user_group_metric_categories')
    .select('id, name, description')
    .eq('ws_id', normalizedWsId)
    .order('name', { ascending: true });

  if (metricCategoriesError) {
    serverLogger.error(
      'Error fetching group metric categories:',
      metricCategoriesError
    );
    return NextResponse.json(
      { message: 'Error fetching metric categories' },
      { status: 500 }
    );
  }

  // Fetch user indicators
  const { data: userIndicators, error: userIndicatorsError } = await sbAdmin
    .from('user_indicators')
    .select(`
      user_id,
      indicator_id,
      value,
      user_group_metrics!inner(group_id)
    `)
    .eq('user_group_metrics.group_id', groupId);

  if (userIndicatorsError) {
    serverLogger.error(
      'Error fetching group user indicators:',
      userIndicatorsError
    );
    return NextResponse.json(
      { message: 'Error fetching user indicators' },
      { status: 500 }
    );
  }

  // Fetch manager IDs
  const { data: managers, error: managersError } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('user_id')
    .eq('group_id', groupId)
    .eq('role', 'TEACHER');

  if (managersError) {
    serverLogger.error('Error fetching group managers:', managersError);
    return NextResponse.json(
      { message: 'Error fetching group managers' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    groupIndicators: (groupIndicators || []).map((indicator) => ({
      id: indicator.id,
      name: indicator.name,
      factor: indicator.factor,
      unit: indicator.unit,
      is_weighted: indicator.is_weighted,
      categories: mapMetricCategories(
        indicator.user_group_metric_category_links
      ),
    })),
    metricCategories: metricCategories || [],
    userIndicators: (userIndicators || []).map((ui) => ({
      user_id: ui.user_id,
      indicator_id: ui.indicator_id,
      value: ui.value,
    })),
    managerUserIds: (managers || []).map((m) => m.user_id),
  });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { containsPermission } = permissions;
  if (!containsPermission('create_user_groups_scores')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage indicators' },
      { status: 403 }
    );
  }

  const {
    name,
    unit,
    factor,
    categoryIds = [],
    isWeighted = true,
  } = await req.json();

  if (!name) {
    return NextResponse.json({ message: 'Name is required' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);
  const { data, error } = await sbAdmin
    .schema('private')
    .rpc('admin_create_user_group_metric_with_audit_actor', {
      p_actor_auth_uid: actorAuthUid ?? undefined,
      p_category_ids: Array.isArray(categoryIds) ? categoryIds : [],
      p_group_id: groupId,
      p_payload: {
        factor: factor || 1,
        is_weighted: isWeighted !== false,
        name,
        unit: unit?.trim() || '',
      },
      p_ws_id: normalizedWsId,
    });

  if (error) {
    serverLogger.error('Error creating group indicator:', error);
    return NextResponse.json(
      { message: 'Error creating indicator' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { message: 'User group not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;
  const normalizedWsId = await resolveUserGroupRouteWorkspaceId(wsId, req);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const values = (await req.json()) as {
    user_id: string;
    indicator_id: string;
    value: number | null;
  }[];

  if (!Array.isArray(values)) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();
  const actorAuthUid = await resolveRequestActorAuthUid(req);

  const { error } = await sbAdmin
    .schema('private')
    .rpc('admin_upsert_user_indicator_values_with_audit_actor', {
      p_actor_auth_uid: actorAuthUid ?? undefined,
      p_group_id: groupId,
      p_values: values,
      p_ws_id: normalizedWsId,
    });

  if (error) {
    serverLogger.error('Error updating group indicator values:', error);
    return NextResponse.json(
      { message: 'Error updating indicator values' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
