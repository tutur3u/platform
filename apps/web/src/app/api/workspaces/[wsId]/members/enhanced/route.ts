import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getWorkspaceMembers } from '@/lib/workspace-members';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

const normalizeWorkspaceId = async (wsId: string): Promise<string | null> => {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const workspace = await getWorkspace(wsId);
    if (!workspace) return null;
    return workspace.id;
  }

  return resolveWorkspaceId(wsId);
};

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId: id } = await params;
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();

  const wsId = await normalizeWorkspaceId(id);
  if (!wsId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Get status filter from query params
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  try {
    const members = await getWorkspaceMembers({
      supabase,
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
