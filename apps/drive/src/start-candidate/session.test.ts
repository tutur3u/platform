// @vitest-environment node
import {
  createAppSessionTokenPair,
  getAppSessionClaimsFromRequest,
} from '@tuturuuu/auth/app-session-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: vi.fn(),
  workspace: vi.fn(),
  permissions: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: auth.user,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: auth.workspace,
  getPermissions: auth.permissions,
}));

import {
  getDriveWorkspace,
  getDriveWorkspacePermissions,
} from '../lib/workspace';

describe('Drive session actor fencing', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not resolve workspace data without a Drive session actor', async () => {
    auth.user.mockResolvedValue(null);
    expect(await getDriveWorkspace('foreign-workspace')).toBeNull();
    expect(await getDriveWorkspacePermissions('foreign-workspace')).toBeNull();
    expect(auth.user).toHaveBeenNthCalledWith(1, 'drive');
    expect(auth.user).toHaveBeenNthCalledWith(2, 'drive');
    expect(auth.workspace).not.toHaveBeenCalled();
    expect(auth.permissions).not.toHaveBeenCalled();
  });

  it('passes the Drive actor to workspace and permission lookups', async () => {
    const user = { id: 'drive-user' };
    auth.user.mockResolvedValue(user);
    auth.workspace.mockResolvedValue({ id: 'workspace-a' });
    auth.permissions.mockResolvedValue({ permissions: ['manage_drive'] });
    expect(await getDriveWorkspace('workspace-a')).toEqual({
      id: 'workspace-a',
    });
    expect(await getDriveWorkspacePermissions('workspace-a')).toEqual({
      permissions: ['manage_drive'],
    });
    expect(auth.workspace).toHaveBeenCalledWith('workspace-a', {
      useAdmin: true,
      user,
    });
    expect(auth.permissions).toHaveBeenCalledWith({
      user,
      wsId: 'workspace-a',
    });
  });
});

describe('Drive signed session audience', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  const secret = 'drive-test-only-signing-key';
  it('accepts Drive and rejects another app, invalid signatures and expired sessions', () => {
    const options = { targetApp: 'drive', secret, now };
    const token = (targetApp: string) =>
      createAppSessionTokenPair(
        {
          targetApp,
          userId: 'fixture-user',
          email: 'fixture@example.test',
        },
        { secret, now }
      ).access.token;
    const request = (accessToken: string) =>
      new Request('https://drive.tutur3u.com/personal', {
        headers: { cookie: `tuturuuu_app_session=${accessToken}` },
      });
    expect(
      getAppSessionClaimsFromRequest(request(token('drive')), options)?.sub
    ).toBe('fixture-user');
    expect(
      getAppSessionClaimsFromRequest(request(token('tasks')), options)
    ).toBeNull();
    expect(
      getAppSessionClaimsFromRequest(request(token('drive')), {
        ...options,
        secret: 'wrong-secret',
      })
    ).toBeNull();
    expect(
      getAppSessionClaimsFromRequest(request(token('drive')), {
        ...options,
        now: new Date('2030-01-01'),
      })
    ).toBeNull();
  });
});
