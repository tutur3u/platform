import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    projectId: string;
  }>;
}

async function requireWorkspaceBoardAccess(
  request: Request,
  rawWsId: string,
  projectId: string
) {
  const supabase = await createClient(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return {
      error: NextResponse.json(
        { message: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  const permissions = await getPermissions({ wsId, request });
  if (!permissions?.containsPermission('manage_projects')) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  const sbAdmin = await createAdminClient();
  const { data: board, error: boardError } = await sbAdmin
    .from('workspace_boards')
    .select('id, ws_id')
    .eq('id', projectId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (boardError) {
    return {
      error: NextResponse.json(
        { message: 'Failed to verify project ownership' },
        { status: 500 }
      ),
    };
  }

  if (!board) {
    return {
      error: NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      ),
    };
  }

  return { wsId, projectId, sbAdmin };
}

export async function PUT(req: Request, { params }: Params) {
  const data = await req.json();
  const { wsId: rawWsId, projectId } = await params;
  const access = await requireWorkspaceBoardAccess(req, rawWsId, projectId);

  if ('error' in access) {
    return access.error;
  }

  const { sbAdmin, wsId } = access;

  const { data: updatedProject, error } = await sbAdmin
    .from('workspace_boards')
    .update(data)
    .eq('id', projectId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error updating workspace API config' },
      { status: 500 }
    );
  }

  if (!updatedProject) {
    return NextResponse.json(
      { message: 'Workspace project not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId: rawWsId, projectId } = await params;
  const access = await requireWorkspaceBoardAccess(req, rawWsId, projectId);

  if ('error' in access) {
    return access.error;
  }

  const { sbAdmin, wsId } = access;

  const { data: deletedProject, error } = await sbAdmin
    .from('workspace_boards')
    .delete()
    .eq('id', projectId)
    .eq('ws_id', wsId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error deleting workspace API config' },
      { status: 500 }
    );
  }

  if (!deletedProject) {
    return NextResponse.json(
      { message: 'Workspace project not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
