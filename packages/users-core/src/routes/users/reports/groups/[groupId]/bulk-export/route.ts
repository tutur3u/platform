import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserGroupRoutePermissions } from '../../../../../../lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '../../../../../../lib/user-groups/route-helpers';

const SearchParamsSchema = z.object({
  title: z.string(),
  status: z.enum(['ALL', 'APPROVED']).default('ALL'),
});

interface Params {
  params: Promise<{ groupId: string; wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { groupId, wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const permissions = await getUserGroupRoutePermissions(wsId, request);
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('view_user_groups_reports')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  let query = sbAdmin
    .schema('private')
    .from('external_user_monthly_reports_workspace_view')
    .select('*')
    .eq('user_ws_id', wsId)
    .eq('group_id', groupId)
    .eq('title', parsed.data.title)
    .order('user_full_name', { ascending: true });
  if (parsed.data.status === 'APPROVED') {
    query = query.eq('report_approval_status', 'APPROVED');
  }
  const { data, error } = await query;
  if (error) {
    console.error('Error fetching reports for export:', error);
    return NextResponse.json(
      { message: 'Error fetching reports' },
      { status: 500 }
    );
  }
  return NextResponse.json(data ?? []);
}
