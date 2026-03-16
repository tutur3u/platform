import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    groupId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, groupId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('workspace_user_groups_users')
    .select('user:workspace_users!inner(id, full_name, ws_id)')
    .eq('group_id', groupId)
    .eq('role', 'TEACHER')
    .eq('user.ws_id', wsId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching group managers' },
      { status: 500 }
    );
  }

  const managers = (data || []).map((row) => {
    const u = row.user as unknown as
      | { id: string; full_name: string | null }
      | { id: string; full_name: string | null }[];
    if (Array.isArray(u)) {
      return {
        id: u[0]?.id,
        full_name: u[0]?.full_name || null,
      };
    }
    return {
      id: u?.id,
      full_name: u?.full_name || null,
    };
  });

  return NextResponse.json(managers);
}
