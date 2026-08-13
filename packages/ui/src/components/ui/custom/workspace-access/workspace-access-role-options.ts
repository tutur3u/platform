import type { WorkspaceAccessAdapter, WorkspaceAccessRole } from './types';

export async function listAllWorkspaceAccessRoles(
  adapter: WorkspaceAccessAdapter,
  workspaceId: string
) {
  const pageSize = 100;
  const roles: WorkspaceAccessRole[] = [];

  for (let page = 1; ; page += 1) {
    const result = await adapter.listRoleOptions(workspaceId, {
      page: String(page),
      pageSize: String(pageSize),
    });
    roles.push(...result.data.map((role) => ({ ...role, permissions: [] })));

    if (roles.length >= result.count || result.data.length < pageSize) {
      return { count: result.count, data: roles };
    }
  }
}
