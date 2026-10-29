import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getReportReadGroupIds } from '@tuturuuu/users-core/routes/users/reports/group-read-access';
import { NextResponse } from 'next/server';
import { getUserGroupRoutePermissions } from '../../../../../lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '../../../../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ reportId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { reportId, wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (permissions.withoutPermission('view_user_groups_reports')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const accessibleGroupIds = await getReportReadGroupIds({
    request: request,
    wsId: permissions.wsId,
    canManageUsers: permissions.containsPermission('manage_users'),
  });
  const sbAdmin = await createAdminClient();
  let query = sbAdmin
    .schema('private')
    .from('external_user_monthly_report_logs_workspace_view')
    .select('*')
    .eq('report_id', reportId)
    .eq('user_ws_id', permissions.wsId)
    .eq('group_ws_id', permissions.wsId)
    .order('created_at', { ascending: false });
  if (accessibleGroupIds !== null) {
    query = query.in('group_id', accessibleGroupIds);
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching report logs:', error);
    return NextResponse.json(
      { message: 'Error fetching report logs' },
      { status: 500 }
    );
  }
  return NextResponse.json(data ?? []);
}
