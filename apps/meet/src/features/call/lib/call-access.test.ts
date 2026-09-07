import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  membership: vi.fn(),
  host: vi.fn(),
  meeting: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { getMeetCallAccess } from './call-access';

const meetingId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.meeting };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.admin.mockResolvedValue({
    from: () => query,
    auth: { admin: { getUserById: mocks.host } },
  });
  mocks.user.mockResolvedValue({ id: 'external', email: 'guest@example.com' });
  mocks.membership.mockResolvedValue({ ok: false });
  mocks.meeting.mockResolvedValue({
    data: {
      id: meetingId,
      ws_id: 'workspace',
      creator_id: 'host',
      name: 'Invited call',
    },
    error: null,
  });
  mocks.host.mockResolvedValue({
    data: {
      user: { email: 'host@tuturuuu.com', email_confirmed_at: '2026-01-01' },
    },
    error: null,
  });
});

it('allows an external signed-in invitee without granting workspace access', async () => {
  expect(await getMeetCallAccess(meetingId)).toMatchObject({
    isHost: false,
    canReadWorkspace: false,
    user: { id: 'external' },
  });
  expect(mocks.host).toHaveBeenCalledWith('host');
});

it.each([
  { email: 'host@example.com', email_confirmed_at: '2026-01-01' },
  {
    email: 'host@tuturuuu.com.attacker.test',
    email_confirmed_at: '2026-01-01',
  },
  { email: 'host@tuturuuu.com', email_confirmed_at: null },
])(
  'rejects guests when the creator is not a verified company account: %j',
  async (user) => {
    mocks.host.mockResolvedValue({ data: { user }, error: null });
    await expect(getMeetCallAccess(meetingId)).rejects.toMatchObject({
      status: 403,
    });
  }
);

it('keeps workspace members admitted without making them hosts', async () => {
  mocks.membership.mockResolvedValue({ ok: true });
  expect(await getMeetCallAccess(meetingId)).toMatchObject({
    isHost: false,
    canReadWorkspace: true,
  });
  expect(mocks.host).not.toHaveBeenCalled();
});

it('does not let a removed creator regain host access as a guest', async () => {
  mocks.user.mockResolvedValue({ id: 'host' });
  await expect(getMeetCallAccess(meetingId)).rejects.toMatchObject({
    status: 403,
  });
});

it('requires sign-in before reading meeting metadata', async () => {
  mocks.user.mockResolvedValue(null);
  await expect(getMeetCallAccess(meetingId)).rejects.toMatchObject({
    status: 401,
  });
  expect(mocks.admin).not.toHaveBeenCalled();
});

it('does not turn a failed membership lookup into guest access', async () => {
  mocks.membership.mockResolvedValue({
    ok: false,
    error: 'membership_lookup_failed',
  });
  await expect(getMeetCallAccess(meetingId)).rejects.toMatchObject({
    status: 500,
  });
  expect(mocks.host).not.toHaveBeenCalled();
});
