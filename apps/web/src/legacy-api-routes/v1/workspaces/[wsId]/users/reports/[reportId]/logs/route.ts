import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    reportId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, reportId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_reports')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const { data, error } = await privateDb
    .from('external_user_monthly_report_logs_workspace_view')
    .select('*')
    .eq('report_id', reportId)
    .eq('user_ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching report logs' },
      { status: 500 }
    );
  }

  const mappedLogs = (data || []).map((entry) => {
    return {
      ...entry,
      creator_name: entry.creator_display_name || entry.creator_full_name,
    };
  });

  return NextResponse.json(mappedLogs);
}
