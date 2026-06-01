import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
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
    .from('workspace_promotions')
    .select('*', { count: 'exact' })
    .eq('ws_id', authorization.value.wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    serverLogger.error('Error fetching workspace promotions:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
