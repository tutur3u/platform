import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({
  permissions: vi.fn(),
  withoutPermission: vi.fn(),
  membershipRow: vi.fn(),
  educationFlag: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-access', () => ({
  getSatelliteWorkspacePermissions: access.permissions,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => ({ id: 'actor' }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: access.from }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

import { requireTeachWorkspaceMember } from './require-teach-workspace-member';

beforeEach(() => {
  vi.clearAllMocks();
  access.withoutPermission.mockReturnValue(false);
  access.permissions.mockResolvedValue({
    wsId: 'canonical-workspace',
    membershipType: 'MEMBER',
    withoutPermission: access.withoutPermission,
  });
  access.membershipRow.mockResolvedValue({
    data: { type: 'MEMBER' },
    error: null,
  });
  access.educationFlag.mockResolvedValue({
    data: { value: 'true' },
    error: null,
  });
  access.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: access.eq.mockImplementation(() => query),
      maybeSingle:
        table === 'workspace_members'
          ? access.membershipRow
          : access.educationFlag,
    };
    return query;
  });
});

afterEach(() => vi.restoreAllMocks());

describe('Teach direct workspace membership and education gate', () => {
  it('checks the actual member row using the app actor and canonical workspace', async () => {
    await requireTeachWorkspaceMember('personal', 'ai_lab');
    expect(access.eq).toHaveBeenCalledWith('ws_id', 'canonical-workspace');
    expect(access.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(access.from.mock.calls).toEqual([
      ['workspace_members'],
      ['workspace_secrets'],
    ]);
    expect(access.withoutPermission).toHaveBeenCalledWith('ai_lab');
  });

  it.each([
    { data: null, error: null },
    { data: { type: 'GUEST' }, error: null },
  ])(
    'denies a MEMBER permission result when the direct row is $data',
    async (result) => {
      access.membershipRow.mockResolvedValue(result);
      await expect(requireTeachWorkspaceMember('workspace')).rejects.toThrow(
        'NEXT_NOT_FOUND'
      );
      expect(access.membershipRow).toHaveBeenCalledOnce();
      expect(access.educationFlag).not.toHaveBeenCalled();
      expect(access.from).not.toHaveBeenCalledWith('workspace_secrets');
    }
  );

  it('logs a sanitized membership lookup failure and throws to the error boundary', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    access.membershipRow.mockResolvedValue({
      data: { type: 'MEMBER' },
      error: new Error('sensitive membership diagnostic'),
    });
    await expect(requireTeachWorkspaceMember('workspace')).rejects.toThrow(
      'Failed to verify Teach workspace membership'
    );
    expect(log.mock.calls).toEqual([
      ['Teach workspace membership lookup failed'],
    ]);
    expect(access.educationFlag).not.toHaveBeenCalled();
  });

  it('logs a sanitized flag lookup failure even if the result also contains true', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    access.educationFlag.mockResolvedValue({
      data: { value: 'true' },
      error: new Error('sensitive flag diagnostic'),
    });
    await expect(requireTeachWorkspaceMember('workspace')).rejects.toThrow(
      'Failed to verify Teach education access'
    );
    expect(log.mock.calls).toEqual([['Teach education flag lookup failed']]);
    expect(access.membershipRow).toHaveBeenCalledOnce();
    expect(access.educationFlag).toHaveBeenCalledOnce();
  });

  it.each([null, { value: 'false' }])(
    'keeps missing or disabled flags as not found: %j',
    async (data) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      access.educationFlag.mockResolvedValue({ data, error: null });
      await expect(requireTeachWorkspaceMember('workspace')).rejects.toThrow(
        'NEXT_NOT_FOUND'
      );
      expect(log).not.toHaveBeenCalled();
    }
  );
});
