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

  const { data, error } = await sbAdmin
    .from('external_user_monthly_report_logs')
    .select(
      '*, creator:workspace_users!creator_id(full_name, display_name), user:workspace_users!user_id!inner(ws_id)'
    )
    .eq('report_id', reportId)
    .eq('user.ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching report logs' },
      { status: 500 }
    );
  }

  const mappedLogs = (data || []).map((entry) => {
    const creator = entry.creator as unknown as {
      full_name: string | null;
      display_name: string | null;
    } | null;

    return {
      ...entry,
      creator_name: creator?.display_name || creator?.full_name,
    };
  });

  return NextResponse.json(mappedLogs);
}
