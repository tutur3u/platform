import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  membership: vi.fn(),
  host: vi.fn(),
  meeting: vi.fn(),
  profile: vi.fn(),
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
    from: (table: string) => {
      if (table !== 'users') return query;
      const profileQuery = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: mocks.profile,
      };
      profileQuery.select.mockReturnValue(profileQuery);
      profileQuery.eq.mockReturnValue(profileQuery);
      return profileQuery;
    },
    auth: { admin: { getUserById: mocks.host } },
  });
  mocks.profile.mockResolvedValue({ data: null, error: null });
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
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
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
    await expect(getMeetCallAccess(meetingId, 'Guest')).rejects.toMatchObject({
      status: 403,
    });
  }
);

it('keeps workspace members admitted without making them hosts', async () => {
  mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    isHost: false,
    canReadWorkspace: true,
  });
  expect(mocks.host).not.toHaveBeenCalled();
});

it('does not let a removed creator regain host access as a guest', async () => {
  mocks.user.mockResolvedValue({ id: 'host' });
  await expect(getMeetCallAccess(meetingId, 'Guest')).rejects.toMatchObject({
    status: 403,
  });
});

it('requires sign-in before reading meeting metadata', async () => {
  mocks.user.mockResolvedValue(null);
  await expect(getMeetCallAccess(meetingId, 'Guest')).rejects.toMatchObject({
    status: 401,
  });
  expect(mocks.admin).not.toHaveBeenCalled();
});

it('does not turn a failed membership lookup into guest access', async () => {
  mocks.membership.mockResolvedValue({
    ok: false,
    error: 'membership_lookup_failed',
  });
  await expect(getMeetCallAccess(meetingId, 'Guest')).rejects.toMatchObject({
    status: 500,
  });
  expect(mocks.host).not.toHaveBeenCalled();
});

it('preserves workspace guest admission without exposing member-only archives', async () => {
  mocks.membership.mockResolvedValue({ ok: true, membershipType: 'GUEST' });
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    admission: 'open',
    canReadWorkspace: false,
  });
  expect(mocks.membership).toHaveBeenCalledWith(
    expect.objectContaining({ requiredType: 'ANY' })
  );
  expect(mocks.host).not.toHaveBeenCalled();
});

it('uses the profile name and canonical personal workspace path', async () => {
  mocks.user.mockResolvedValue({
    id: 'host',
    user_metadata: { display_name: 'Meeting Host' },
    email: 'host@tuturuuu.com',
  });
  mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
  mocks.meeting.mockResolvedValue({
    data: {
      id: meetingId,
      ws_id: meetingId,
      creator_id: 'host',
      workspaces: { personal: true },
    },
    error: null,
  });
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    displayName: 'Meeting Host',
    workspaceSlug: 'personal',
    admission: 'open',
    isHost: true,
  });
});

it('does not grant host privileges to a creator downgraded to workspace guest', async () => {
  mocks.user.mockResolvedValue({ id: 'host' });
  mocks.membership.mockResolvedValue({ ok: true, membershipType: 'GUEST' });
  await expect(getMeetCallAccess(meetingId, 'Guest')).rejects.toMatchObject({
    status: 403,
  });
});

it('uses the stored profile for app sessions without profile metadata', async () => {
  mocks.profile.mockResolvedValue({
    data: {
      display_name: null,
      user_private_details: { full_name: 'Stored Full Name' },
    },
    error: null,
  });
  expect(await getMeetCallAccess(meetingId, 'Khách')).toMatchObject({
    displayName: 'Stored Full Name',
  });
});
it('uses the localized fallback for an unnamed guest', async () => {
  mocks.user.mockResolvedValue({ id: 'external', user_metadata: {} });
  expect(await getMeetCallAccess(meetingId, 'Khách')).toMatchObject({
    displayName: 'Khách',
  });
});

it('requests a saved display name when only an email fallback exists', async () => {
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    displayName: 'guest@example.com',
    needsDisplayName: true,
  });
});

it('reuses a saved profile display name on the next join', async () => {
  mocks.profile.mockResolvedValue({
    data: { display_name: 'Saved guest' },
    error: null,
  });
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    displayName: 'Saved guest',
    needsDisplayName: false,
  });
});

it('does not ask to overwrite a profile whose lookup temporarily failed', async () => {
  mocks.profile.mockResolvedValue({
    data: null,
    error: { code: 'unavailable' },
  });
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    needsDisplayName: false,
  });
});

it('suggests an account name but saves a preferred display name before future joins', async () => {
  mocks.user.mockResolvedValue({
    id: 'external',
    email: 'guest@example.com',
    user_metadata: { full_name: 'Account name' },
  });
  expect(await getMeetCallAccess(meetingId, 'Guest')).toMatchObject({
    needsDisplayName: true,
    suggestedDisplayName: 'Account name',
  });
});
