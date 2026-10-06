import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  user: vi.fn(),
  db: vi.fn(),
  permission: vi.fn(),
  redirect: vi.fn(),
  member: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mock.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mock.db,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mock.permission,
  WorkspaceAuthError: class WorkspaceAuthError extends Error {},
}));
vi.mock('next/navigation', () => ({ redirect: mock.redirect }));

import { getDesktopPageAccess } from './page-access';

beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ id: 'actor' });
  mock.db.mockResolvedValue({ from: mock.member });
  mock.member.mockReturnValue(mock.query);
  mock.query.select.mockReturnValue(mock.query);
  mock.query.eq.mockReturnValue(mock.query);
  mock.query.maybeSingle.mockResolvedValue({
    data: { user_id: 'actor' },
    error: null,
  });
  mock.permission.mockResolvedValue({ withoutPermission: () => false });
  mock.redirect.mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});
describe('desktop page registered actor boundary', () => {
  it('preserves personal and non-root redirects before reading an actor', async () => {
    await expect(getDesktopPageAccess('PERSONAL')).rejects.toThrow(
      'redirect:/internal'
    );
    await expect(getDesktopPageAccess('other')).rejects.toThrow(
      'redirect:/other/settings'
    );
    expect(mock.user).not.toHaveBeenCalled();
  });
  it('uses canonical root membership and the exact satellite actor for permission checks', async () => {
    expect(await getDesktopPageAccess('INTERNAL')).toEqual({
      actorId: 'actor',
      canManage: true,
    });
    expect(mock.user).toHaveBeenCalledWith('infra');
    expect(mock.query.eq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000000'
    );
    expect(mock.query.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(mock.query.eq).toHaveBeenCalledWith('type', 'MEMBER');
    expect(mock.permission).toHaveBeenCalledWith({
      user: { id: 'actor' },
      wsId: '00000000-0000-0000-0000-000000000000',
    });
  });
  it('keeps public deployment metadata available to members without private vault permission', async () => {
    mock.permission.mockResolvedValue({ withoutPermission: () => true });
    expect(await getDesktopPageAccess('internal')).toEqual({
      actorId: 'actor',
      canManage: false,
    });
  });
  it('redirects non-members and does not invoke permission shortcuts', async () => {
    mock.query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getDesktopPageAccess('internal')).rejects.toThrow(
      'redirect:/internal/settings'
    );
    expect(mock.permission).not.toHaveBeenCalled();
  });
  it('does not downgrade a membership failure to an access denial or expose database details', async () => {
    mock.query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'private database detail' },
    });
    await expect(getDesktopPageAccess('internal')).rejects.toThrow(
      'Desktop page authorization unavailable'
    );
    expect(mock.redirect).not.toHaveBeenCalled();
    expect(mock.permission).not.toHaveBeenCalled();
  });
  it('does not read service data for an anonymous actor', async () => {
    mock.user.mockResolvedValue(null);
    await expect(getDesktopPageAccess('internal')).rejects.toThrow();
    expect(mock.db).not.toHaveBeenCalled();
  });
});
