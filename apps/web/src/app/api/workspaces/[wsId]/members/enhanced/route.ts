import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  isWorkspaceUuidLiteral,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getWorkspaceMembers } from '@/lib/workspace-members';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();

  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(id, supabase, request);
  } catch {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  if (!isWorkspaceUuidLiteral(wsId)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const permissions = await getPermissions({ request, wsId });
  if (
    !permissions ||
    (permissions.withoutPermission('manage_workspace_members') &&
      permissions.withoutPermission('manage_workspace_roles'))
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get status filter from query params
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  try {
    const members = await getWorkspaceMembers({
      supabase: sbAdmin,
      sbAdmin,
      wsId,
      status,
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error('Error fetching workspace members:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace members' },
      { status: 500 }
    );
  }
}
