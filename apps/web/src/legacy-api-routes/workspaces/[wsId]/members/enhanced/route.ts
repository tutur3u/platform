import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
} from '@tuturuuu/utils/constants';
import { isWorkspaceUuidLiteral } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getWorkspaceMembers } from '@/lib/workspace-members';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const WORKSPACE_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;

function isWorkspaceHandle(identifier: string) {
  const normalized = identifier.trim().toLowerCase();

  return (
    normalized !== PERSONAL_WORKSPACE_SLUG &&
    normalized !== INTERNAL_WORKSPACE_SLUG &&
    !isWorkspaceUuidLiteral(normalized) &&
    WORKSPACE_HANDLE_PATTERN.test(normalized)
  );
}

function workspaceNotFoundResponse() {
  return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId: requestedWsId } = await params;
  const access = await resolveWorkspaceRouteAccess(request, requestedWsId, [
    'manage_workspace_members',
    'manage_workspace_roles',
  ]);

  if (!access.ok) {
    // A denied handle must be indistinguishable from a nonexistent handle.
    // UUID routes keep their explicit authorization response for clients that
    // already possess a stable workspace identifier.
    if (isWorkspaceHandle(requestedWsId)) return workspaceNotFoundResponse();
    return access.response;
  }

  const wsId = access.permissions.wsId;
  if (!isWorkspaceUuidLiteral(wsId)) {
    return workspaceNotFoundResponse();
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
