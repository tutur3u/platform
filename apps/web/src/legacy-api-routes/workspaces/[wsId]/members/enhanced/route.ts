import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { isWorkspaceUuidLiteral } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getWorkspaceMembers } from '@/lib/workspace-members';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId: requestedWsId } = await params;
  const access = await resolveWorkspaceRouteAccess(request, requestedWsId, [
    'manage_workspace_members',
    'manage_workspace_roles',
  ]);

  if (!access.ok) return access.response;

  const wsId = access.permissions.wsId;
  if (!isWorkspaceUuidLiteral(wsId)) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Get status filter from query params
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  try {
    const sbAdmin = await createAdminClient({ noCookie: true });
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
