import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

export async function GET(req: Request) {
  await connection();

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

  const authorization = await authorizeInfrastructureAdminRequest();
  if (!authorization.ok) return authorization.response;
  const supabase = authorization.sbAdmin;

  const { data, error, count } = await supabase
    .from('workspace_user_status_changes')
    .select('*', { count: 'exact' })
    .eq('ws_id', wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    console.error('Error fetching workspace_user_status_changes:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace_user_status_changes' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
