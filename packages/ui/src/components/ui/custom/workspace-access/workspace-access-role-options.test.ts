import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceAccessAdapter, WorkspaceAccessRole } from './types';
import { listAllWorkspaceAccessRoles } from './workspace-access-role-options';

function createRoles(start: number, count: number): WorkspaceAccessRole[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `role-${start + index}`,
    name: `Role ${start + index}`,
    permissions: [],
  }));
}

describe('listAllWorkspaceAccessRoles', () => {
  it('paginates beyond the first 100 assignable roles', async () => {
    const listRoles = vi
      .fn()
      .mockResolvedValueOnce({ count: 125, data: createRoles(0, 100) })
      .mockResolvedValueOnce({ count: 125, data: createRoles(100, 25) });

    const result = await listAllWorkspaceAccessRoles(
      { listRoles } as unknown as WorkspaceAccessAdapter,
      'workspace-1'
    );

    expect(result.data).toHaveLength(125);
    expect(listRoles).toHaveBeenNthCalledWith(1, 'workspace-1', {
      page: '1',
      pageSize: '100',
    });
    expect(listRoles).toHaveBeenNthCalledWith(2, 'workspace-1', {
      page: '2',
      pageSize: '100',
    });
  });
});
