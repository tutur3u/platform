import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { User } from '@tuturuuu/types/primitives/User';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

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
  const supabase = await createClient();
  const sbAdmin = await createAdminClient();

  const wsId = await normalizeWorkspaceId(id);
  if (!wsId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  // Get status filter from query params
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');

  // Fetch workspace secrets for hiding email/name
  const { data: secretData, error: secretError } = await sbAdmin
    .from('workspace_secrets')
    .select('name')
    .eq('ws_id', wsId)
    .in('name', ['HIDE_MEMBER_EMAIL', 'HIDE_MEMBER_NAME'])
    .eq('value', 'true');

  if (secretError) {
    console.error('Error fetching workspace secrets:', secretError);
    return NextResponse.json(
      { message: 'Error fetching workspace secrets' },
      { status: 500 }
    );
  }

  // Build query for members and invites
  const queryBuilder = supabase
    .from('workspace_members_and_invites')
    .select(
      'id, handle, email, display_name, avatar_url, pending, created_at',
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('pending')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  // Apply status filter
  if (status && status !== 'all') {
    queryBuilder.eq('pending', status === 'invited');
  }

  const { data, error } = await queryBuilder;

  if (error) {
    console.error('Error fetching workspace members:', error);
    return NextResponse.json(
      { message: 'Error fetching workspace members' },
      { status: 500 }
    );
  }

  // Fetch workspace creator
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  // Fetch role memberships for all users with permissions
  const userIds = data.filter((m) => !m.pending && m.id).map((m) => m.id!);
  const { data: roleMembershipsData } = await supabase
    .from('workspace_role_members')
    .select(
      'user_id, workspace_roles!inner(id, name, ws_id, workspace_role_permissions(permission, enabled))'
    )
    .eq('workspace_roles.ws_id', wsId)
    .in('user_id', userIds);

  // Fetch default permissions
  const { data: defaultPermissionsData } = await supabase
    .from('workspace_default_permissions')
    .select('permission, enabled')
    .eq('ws_id', wsId)
    .eq('enabled', true);

  // Build role map with permissions
  const roleMap = new Map<
    string,
    Array<{
      id: string;
      name: string;
      permissions: Array<{ permission: string; enabled: boolean }>;
    }>
  >();

  roleMembershipsData?.forEach((rm: any) => {
    if (!roleMap.has(rm.user_id)) {
      roleMap.set(rm.user_id, []);
    }
    roleMap.get(rm.user_id)?.push({
      id: rm.workspace_roles.id,
      name: rm.workspace_roles.name,
      permissions: rm.workspace_roles.workspace_role_permissions || [],
    });
  });

  // Transform and return data
  const members = data.map(({ email, ...rest }) => {
    return {
      ...rest,
      display_name:
        secretData.filter((secret) => secret.name === 'HIDE_MEMBER_NAME')
          .length === 0
          ? rest.display_name
          : undefined,
      email:
        secretData.filter((secret) => secret.name === 'HIDE_MEMBER_EMAIL')
          .length === 0
          ? email
          : undefined,
      is_creator: workspaceData?.creator_id === rest.id,
      roles: rest.id ? roleMap.get(rest.id) || [] : [],
      default_permissions: defaultPermissionsData || [],
    };
  }) as (User & {
    is_creator: boolean;
    roles: Array<{
      id: string;
      name: string;
      permissions: Array<{ permission: string; enabled: boolean }>;
    }>;
    default_permissions: Array<{ permission: string; enabled: boolean }>;
  })[];

  return NextResponse.json(members);
}
