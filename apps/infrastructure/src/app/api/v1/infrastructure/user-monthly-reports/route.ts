import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { authorizeInfrastructureMigrationExport } from '../migration-export-auth';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wsId = searchParams.get('ws_id');
  const limit = searchParams.get('limit') || '1000';
  const offset = searchParams.get('offset') || '0';

  if (!wsId) {
    return NextResponse.json(
      { message: 'Missing ws_id parameter' },
      { status: 400 }
    );
  }

  const authorization = await authorizeInfrastructureMigrationExport(req, wsId);
  if (!authorization.ok) return authorization.response;

  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const { data, error, count } = await privateDb
    .from('external_user_monthly_reports_workspace_view')
    .select('*', { count: 'exact' })
    .eq('user_ws_id', authorization.value.wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    console.error('Error fetching external_user_monthly_reports:', error);
    return NextResponse.json(
      { message: 'Error fetching external_user_monthly_reports' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
