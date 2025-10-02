import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createClient();

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

  const { data, error, count } = await supabase
    .from('external_user_monthly_report_logs')
    .select('*, external_user_monthly_reports!report_id!inner(user_id), workspace_users!external_user_monthly_report_logs_user_id_fkey!inner(ws_id)', { count: 'exact' })
    .eq('workspace_users.ws_id', wsId)
    .range(Number.parseInt(offset, 10), Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1);

  if (error) {
    console.error('Error fetching external_user_monthly_report_logs:', error);
    return NextResponse.json(
      { message: 'Error fetching external_user_monthly_report_logs' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
