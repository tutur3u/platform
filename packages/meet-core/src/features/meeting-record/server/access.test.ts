import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  membership: vi.fn(),
  permissions: vi.fn(),
  meeting: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/runtime', () => ({ MEETING_APP: 'meet' }));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: async () => false,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: mocks.meeting,
    };
    return { from: () => query };
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  resolveWorkspaceIdForPrincipal: async ({ wsId }: { wsId: string }) => wsId,
  verifyWorkspaceMembershipType: mocks.membership,
  getPermissions: mocks.permissions,
}));

import { meetingRecordAccess } from './access';

const wsId = '22222222-2222-4222-8222-222222222222';
const meetingId = '33333333-3333-4333-8333-333333333333';
const hostId = '11111111-1111-4111-8111-111111111111';
const otherId = '44444444-4444-4444-8444-444444444444';
const params = { params: Promise.resolve({ wsId, meetingId }) };
const read = new Request('https://meet.tuturuuu.com/api/meet-record/x/y');
const write = new Request('https://meet.tuturuuu.com/api/meet-record/x/y', {
  method: 'POST',
  headers: { origin: 'https://meet.tuturuuu.com' },
});

function as(
  userId: string,
  memberType: 'MEMBER' | 'GUEST' | null,
  granted: string[]
) {
  mocks.user.mockResolvedValue({ id: userId, email: null });
  mocks.membership.mockImplementation(
    async ({ requiredType }: { requiredType?: string }) =>
      memberType && (!requiredType || requiredType === memberType)
        ? { ok: true }
        : { ok: false }
  );
  mocks.permissions.mockResolvedValue({
    containsPermission: (permission: string) => granted.includes(permission),
  });
}

describe('meetingRecordAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.meeting.mockResolvedValue({
      data: {
        id: meetingId,
        creator_id: hostId,
        name: 'M',
        time: '2026-12-01T00:00:00Z',
        ws_id: wsId,
      },
      error: null,
    });
  });

  it('refuses a non-member', async () => {
    as(otherId, null, ['manage_projects', 'admin']);
    await expect(meetingRecordAccess(read, params)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('refuses a guest, even one who hosts the meeting', async () => {
    as(hostId, 'GUEST', ['manage_projects']);
    await expect(meetingRecordAccess(read, params)).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({ requiredType: 'MEMBER' })
    );
  });

  it('lets a non-host member with manage_projects read but not edit or link', async () => {
    as(otherId, 'MEMBER', ['manage_projects']);
    await expect(
      meetingRecordAccess(write, params, true)
    ).resolves.toMatchObject({
      isHost: false,
      canEditRecord: false,
      canLinkProjects: false,
    });
  });

  it('needs manage_projects for the host to link', async () => {
    as(hostId, 'MEMBER', []);
    await expect(meetingRecordAccess(read, params)).resolves.toMatchObject({
      canEditRecord: true,
      canLinkProjects: false,
    });
    as(hostId, 'MEMBER', ['manage_projects']);
    await expect(meetingRecordAccess(read, params)).resolves.toMatchObject({
      canLinkProjects: true,
    });
  });

  it('lets a workspace admin edit a meeting they do not host', async () => {
    as(otherId, 'MEMBER', ['admin', 'manage_projects']);
    await expect(meetingRecordAccess(read, params)).resolves.toMatchObject({
      canEditRecord: true,
      canLinkProjects: true,
    });
  });

  it('refuses a write from another origin', async () => {
    as(hostId, 'MEMBER', ['manage_projects']);
    const forged = new Request(
      'https://meet.tuturuuu.com/api/meet-record/x/y',
      {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }
    );
    await expect(
      meetingRecordAccess(forged, params, true)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.user).not.toHaveBeenCalled();
  });

  it('reports a meeting outside the workspace as not found', async () => {
    as(hostId, 'MEMBER', ['manage_projects']);
    mocks.meeting.mockResolvedValue({ data: null, error: null });
    await expect(meetingRecordAccess(read, params)).rejects.toMatchObject({
      status: 404,
    });
  });
});
