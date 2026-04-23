import { NextResponse } from 'next/server';
import { requireWorkspaceExternalProjectAccess } from '@/lib/external-projects/access';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireWorkspaceExternalProjectAccess({
    mode: 'read',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  const canManageMembers =
    Boolean(
      access.workspacePermissions?.containsPermission(
        'manage_workspace_members'
      )
    ) ||
    Boolean(
      access.rootPermissions?.containsPermission('manage_external_projects')
    ) ||
    Boolean(
      access.rootPermissions?.containsPermission('manage_workspace_roles')
    );
  const canManageRoles =
    Boolean(
      access.workspacePermissions?.containsPermission('manage_workspace_roles')
    ) ||
    Boolean(
      access.rootPermissions?.containsPermission('manage_external_projects')
    ) ||
    Boolean(
      access.rootPermissions?.containsPermission('manage_workspace_roles')
    );

  return NextResponse.json({
    boundProjectName: access.binding.canonical_project?.display_name ?? null,
    canManageMembers,
    canManageRoles,
    currentUserEmail: access.user.email ?? null,
    workspaceId: access.normalizedWorkspaceId,
  });
}
