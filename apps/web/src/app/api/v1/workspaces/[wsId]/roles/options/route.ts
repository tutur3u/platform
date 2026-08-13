import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  await connection();
  const { wsId } = await params;
  const access = await resolveWorkspaceRouteAccess(req, wsId, [
    'manage_workspace_roles',
  ]);
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(
    1,
    Number.parseInt(searchParams.get('page') ?? '1', 10)
  );
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get('pageSize') ?? '100', 10))
  );
  const start = (page - 1) * pageSize;
  const supabase = await createAdminClient({ noCookie: true });
  const { data, error, count } = await supabase
    .from('workspace_roles')
    .select('id, name', { count: 'exact' })
    .eq('ws_id', access.permissions.wsId)
    .order('created_at', { ascending: false })
    .range(start, start + pageSize - 1);

  if (error) {
    console.error('Failed to list workspace role options', {
      error,
      wsId: access.permissions.wsId,
    });
    return NextResponse.json(
      { message: 'Error fetching workspace role options' },
      { status: 500 }
    );
  }

  return NextResponse.json({ count: count ?? 0, data: data ?? [] });
}
