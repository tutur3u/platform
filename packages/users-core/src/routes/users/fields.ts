import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export interface WorkspaceUserFieldsParams {
  params: Promise<{ wsId: string }>;
}

export interface WorkspaceUserFieldsActor {
  email?: string | null;
  id: string;
}

export async function handleListWorkspaceUserFieldsRequest(
  request: Request,
  { params }: WorkspaceUserFieldsParams,
  actor: WorkspaceUserFieldsActor
) {
  const { wsId: rawWsId } = await params;
  const wsId = await normalizeWorkspaceId(rawWsId);
  const permissions = await getPermissions({ request, user: actor, wsId });

  if (
    !permissions ||
    (!permissions.containsPermission('view_users_private_info') &&
      !permissions.containsPermission('view_users_public_info'))
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin
    .from('workspace_user_fields')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching workspace user fields', { error, wsId });
    return NextResponse.json(
      { message: 'Error fetching workspace API configs' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
