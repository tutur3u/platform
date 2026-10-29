import { beforeEach, expect, it, vi } from 'vitest';
import { requireEducationPageAccess } from './education-page-access';

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteWorkspace: mocks.workspace,
  getSatelliteWorkspacePermissions: mocks.permissions,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ id: 'resolved-uuid', joined: true });
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
});
for (const route of ['route-uuid', 'workspace-handle', 'PERSONAL']) {
  it(`allows an authorized member via ${route}`, async () => {
    await expect(requireEducationPageAccess(route)).resolves.toMatchObject({
      resolvedWsId: 'resolved-uuid',
    });
    expect(mocks.workspace).toHaveBeenCalledWith('teach', route);
    expect(mocks.permissions).toHaveBeenCalledWith('teach', 'resolved-uuid');
  });
  it.each(['nonmember', 'denied member', 'anonymous', 'missing permissions'])(
    `denies %s via ${route}`,
    async (caller) => {
      if (caller === 'anonymous') mocks.workspace.mockResolvedValue(null);
      if (caller === 'nonmember')
        mocks.workspace.mockResolvedValue({
          id: 'resolved-uuid',
          joined: false,
        });
      if (caller === 'denied member')
        mocks.permissions.mockResolvedValue({
          withoutPermission: (permission: string) => permission === 'ai_lab',
        });
      if (caller === 'missing permissions')
        mocks.permissions.mockResolvedValue(null);
      await expect(requireEducationPageAccess(route)).rejects.toThrow(
        'NEXT_NOT_FOUND'
      );
      if (caller === 'nonmember' || caller === 'anonymous')
        expect(mocks.permissions).not.toHaveBeenCalled();
    }
  );
}
