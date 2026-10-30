import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { canAddCreatorGrantRoleMember } from '@/lib/workspace-creator-grant-permissions';
import { addWorkspaceRoleMembers } from '@/lib/workspace-role-member-mutations';
import { normalizeRoleMembers } from '@/lib/workspace-role-members';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';

interface Params {
  params: Promise<{
    wsId: string;
    roleId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { roleId, wsId } = await params;
  const access = await resolveWorkspaceRouteAccess(req, wsId, [
    'manage_workspace_roles',
  ]);
  if (!access.ok) return access.response;

  const supabase = await createAdminClient({ noCookie: true });
  const resolvedWsId = access.permissions.wsId;

  const { data: role, error: roleError } = await supabase
    .from('workspace_roles')
    .select('id,ws_id')
    .eq('id', roleId)
    .eq('ws_id', resolvedWsId)
    .maybeSingle();

  if (roleError || !role || role.ws_id !== resolvedWsId) {
    console.log(roleError);
    return NextResponse.json({ message: 'Role not found' }, { status: 404 });
  }

  const { data, error, count } = await supabase
    .from('workspace_role_members')
    .select(
      'user_id, users:user_id(id, display_name, avatar_url, user_private_details(email))',
      {
        count: 'exact',
      }
    )
    .eq('role_id', roleId);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching role members' },
      { status: 500 }
    );
  }

  const members = normalizeRoleMembers(data as any[]).map((member) => ({
    id: member.id,
    display_name: member.display_name,
    full_name: member.full_name ?? null,
    avatar_url: member.avatar_url,
    email: member.email,
  }));

  return NextResponse.json({ data: members, count: count ?? members.length });
}

export async function POST(req: Request, { params }: Params) {
  const { roleId, wsId } = await params;
  const access = await resolveWorkspaceRouteAccess(req, wsId, [
    'manage_workspace_roles',
  ]);
  if (!access.ok) return access.response;

  const supabase = await createAdminClient({ noCookie: true });

  const { data: role } = await supabase
    .from('workspace_roles')
    .select('id,ws_id')
    .eq('id', roleId)
    .eq('ws_id', access.permissions.wsId)
    .maybeSingle();
  if (!role || role.ws_id !== access.permissions.wsId) {
    return NextResponse.json({ message: 'Role not found' }, { status: 404 });
  }

  if (
    !(await canAddCreatorGrantRoleMember(supabase, {
      roleId,
      userId: access.user?.id,
      wsId: access.permissions.wsId,
    }))
  ) {
    return NextResponse.json(
      { message: 'Only the workspace creator can add members to this role' },
      { status: 403 }
    );
  }

  return addWorkspaceRoleMembers({
    request: req,
    admin: supabase,
    wsId: access.permissions.wsId,
    roleId,
  });
}
