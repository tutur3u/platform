import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Loader round trips. The real call-access and public-preview logic run on top
 * of mocked storage, so these pin both the access outcomes and how many times
 * each backing read happens per page load.
 */
const mocks = vi.hoisted(() => ({
  sessionUser: vi.fn(),
  currentUser: vi.fn(),
  invitation: vi.fn(),
  workspaceContext: vi.fn(),
  isParleySession: vi.fn(),
  policy: vi.fn(),
  membership: vi.fn(),
  canHost: vi.fn(),
  hostIdentity: vi.fn(),
  permissions: vi.fn(),
  calendarEvent: vi.fn(),
  duration: vi.fn(),
  tables: {} as Record<string, ReturnType<typeof vi.fn>>,
  from: vi.fn(),
}));

vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('server-only', () => ({}));
vi.mock('@tanstack/react-router', () => ({
  notFound: () => ({ notFound: true }),
  redirect: (options: { href: string }) => ({ redirect: options.href }),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetPlanSnapshot: vi.fn(),
  InternalApiError: class extends Error {},
  withForwardedInternalApiAuth: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: mocks.isParleySession,
}));
vi.mock('@tuturuuu/meet-core/parley-access', () => ({
  hasParleyAccess: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/room-access', () => ({
  readMeetingRoomPolicy: mocks.policy,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/meeting-duration', () => ({
  getHostMeetingDurationSeconds: mocks.duration,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.sessionUser,
  getSatelliteCurrentUser: mocks.currentUser,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: mocks.invitation,
}));
vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: () => null,
  getSidebarCollapsedState: () => false,
  parseSidebarBehavior: () => 'expanded',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: mocks.from,
    auth: { admin: { getUserById: mocks.hostIdentity } },
  }),
}));
vi.mock('@tuturuuu/ui/legacy/meet/page', () => ({
  getMeetTogetherPlansData: vi.fn(),
}));
vi.mock('@tuturuuu/utils/meet-hosting', () => ({
  canVerifiedAccountHostMeeting: mocks.canHost,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('../app/[locale]/(auth)/login/page', () => ({ default: vi.fn() }));
vi.mock(
  '../app/[locale]/[wsId]/meetings/[meetingId]/meeting-calendar-event',
  () => ({ loadMeetingCalendarEvent: mocks.calendarEvent })
);
vi.mock('../app/[locale]/[wsId]/workspace-context', () => ({
  getMeetWorkspaceContext: mocks.workspaceContext,
}));
vi.mock('./intl-server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));
vi.mock('./plan-polls', () => ({
  meetPlanPolls: { parse: (v: unknown) => v },
}));
vi.mock('./request-context', () => ({
  cookies: async () => new Map(),
  headers: async () => new Headers(),
  meetRequest: () => ({ request: new Request('https://meet.test/') }),
  withMeetRequest: (_context: unknown, run: () => unknown) => run(),
}));

import { encodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { loadPageModel } from './page-model.server';

const meetingId = '00000000-0000-4000-8000-000000000001';
const code = encodeRoomCode(meetingId);
const meetingRow = {
  id: meetingId,
  name: 'Weekly sync',
  creator_id: 'host',
  ws_id: 'workspace',
  time: '2026-11-02T09:00:00Z',
  workspaces: { personal: false },
};
const hostPolicy = {
  canReadNotes: true,
  ended: false,
  lifecycleVersion: 1,
  settings: { shareNotes: false, publicLinkPreview: true },
};
const guestPolicy = { canReadNotes: false, ended: false, lifecycleVersion: 1 };

function table(name: string, result: unknown) {
  const query: Record<string, unknown> = {};
  const settle = vi.fn(async () => result);
  for (const method of ['select', 'eq', 'order', 'limit'])
    query[method] = () => query;
  query.maybeSingle = settle;
  query.single = settle;
  mocks.tables[name] = settle;
  return query;
}

function reads(name: string) {
  return mocks.tables[name]?.mock.calls.length ?? 0;
}

function signIn(id: string | null) {
  mocks.sessionUser.mockResolvedValue(
    id ? { id, email: `${id}@example.com`, user_metadata: {} } : null
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = {};
  const queries: Record<string, unknown> = {
    workspace_meetings: table('workspace_meetings', {
      data: meetingRow,
      error: null,
    }),
    users: table('users', {
      data: { display_name: 'Saved name', avatar_url: null },
      error: null,
    }),
  };
  mocks.from.mockImplementation((name: string) => queries[name]);
  mocks.isParleySession.mockResolvedValue(false);
  mocks.policy.mockImplementation(async (input: { isHost?: boolean }) =>
    input.isHost ? hostPolicy : guestPolicy
  );
  mocks.membership.mockResolvedValue({ ok: false });
  mocks.canHost.mockResolvedValue(true);
  mocks.hostIdentity.mockResolvedValue({ data: { user: {} }, error: null });
  mocks.currentUser.mockResolvedValue({ id: 'member', display_name: 'M' });
  mocks.invitation.mockResolvedValue(null);
  mocks.workspaceContext.mockResolvedValue({
    user: { id: 'member', email: 'member@example.com' },
    workspace: { id: 'workspace', personal: false, joined: true },
    workspaceSlug: 'workspace',
    wsId: 'workspace',
  });
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  mocks.calendarEvent.mockResolvedValue({ id: 'event', start_at: 'soon' });
  mocks.duration.mockResolvedValue(3600);
});

describe('room page', () => {
  it('shows a signed-out visitor the public invite after one read of each source', async () => {
    signIn(null);
    const model = await loadPageModel(`/r/${code}`);
    expect(model).toMatchObject({
      kind: 'public-invite',
      publicInvite: {
        title: 'Weekly sync',
        scheduledAt: '2026-11-02T09:00:00Z',
        ended: false,
      },
      returnTo: `/r/${code}`,
      meta: { title: 'Weekly sync', indexable: true },
    });
    expect(model).not.toHaveProperty('info');
    expect(reads('workspace_meetings')).toBe(1);
    expect(mocks.isParleySession).toHaveBeenCalledTimes(1);
    expect(mocks.policy).toHaveBeenCalledTimes(1);
    expect(mocks.policy).toHaveBeenCalledWith({
      meetingId,
      wsId: 'workspace',
      userId: 'host',
      isHost: true,
    });
  });

  it('sends a signed-out visitor to login when the preview is private', async () => {
    signIn(null);
    mocks.policy.mockResolvedValue({ ...hostPolicy, settings: {} });
    await expect(loadPageModel(`/r/${code}`)).rejects.toEqual({
      redirect: `/login?next=${encodeURIComponent(`/r/${code}`)}`,
    });
  });

  it('holds a signed-in guest in the lobby with their own policy', async () => {
    signIn('guest');
    const model = await loadPageModel(`/r/${code}`);
    expect(model).toMatchObject({
      kind: 'room',
      meta: { title: 'Weekly sync', indexable: true },
      policy: guestPolicy,
      access: {
        user: { id: 'guest' },
        meeting: { id: meetingId, name: 'Weekly sync', ws_id: 'workspace' },
        isHost: false,
        admission: 'lobby',
        canReadWorkspace: false,
        displayName: 'Saved name',
      },
    });
    if (model.kind !== 'room') throw new Error('expected a room');
    expect(model.access.user).toEqual({ id: 'guest' });
    expect(model.access.meeting).toEqual({
      id: meetingId,
      name: 'Weekly sync',
      ws_id: 'workspace',
    });
    expect(reads('workspace_meetings')).toBe(1);
    expect(mocks.isParleySession).toHaveBeenCalledTimes(1);
    expect(mocks.membership).toHaveBeenCalledTimes(1);
    expect(mocks.policy).toHaveBeenCalledTimes(2);
    expect(mocks.policy).toHaveBeenCalledWith({
      meetingId,
      wsId: 'workspace',
      userId: 'guest',
      isHost: false,
    });
  });

  it('admits a workspace member who is not the host', async () => {
    signIn('member');
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
    const model = await loadPageModel(`/r/${code}`);
    expect(model).toMatchObject({
      kind: 'room',
      policy: guestPolicy,
      access: { isHost: false, admission: 'open', canReadWorkspace: true },
    });
    expect(mocks.hostIdentity).not.toHaveBeenCalled();
    expect(mocks.policy).toHaveBeenCalledTimes(2);
  });

  it('reads the room policy once when the host opens their own room', async () => {
    signIn('host');
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
    const model = await loadPageModel(`/r/${code}`);
    expect(model).toMatchObject({
      kind: 'room',
      meta: { title: 'Weekly sync', indexable: true },
      policy: hostPolicy,
      access: { isHost: true, admission: 'open', canReadWorkspace: true },
    });
    expect(reads('workspace_meetings')).toBe(1);
    expect(mocks.isParleySession).toHaveBeenCalledTimes(1);
    expect(mocks.policy).toHaveBeenCalledTimes(1);
    expect(mocks.policy).toHaveBeenCalledWith({
      meetingId,
      wsId: 'workspace',
      userId: 'host',
      isHost: true,
    });
  });

  it('keeps the host private meta when public previews are off', async () => {
    signIn('host');
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
    const privatePolicy = { ...hostPolicy, settings: { shareNotes: false } };
    mocks.policy.mockResolvedValue(privatePolicy);
    const model = await loadPageModel(`/r/${code}`);
    expect(model).toMatchObject({
      kind: 'room',
      policy: privatePolicy,
      meta: { title: 'meet.public.meta_title', indexable: false },
    });
  });

  it('hides the room from a guest whose host cannot invite guests', async () => {
    signIn('guest');
    mocks.canHost.mockResolvedValue(false);
    await expect(loadPageModel(`/r/${code}`)).rejects.toEqual({
      notFound: true,
    });
    expect(reads('workspace_meetings')).toBe(1);
  });

  it('hides a host who is no longer a workspace member', async () => {
    signIn('host');
    await expect(loadPageModel(`/r/${code}`)).rejects.toEqual({
      notFound: true,
    });
  });

  it('hides a Parley session from Meet without a public preview', async () => {
    signIn('guest');
    mocks.isParleySession.mockResolvedValue(true);
    await expect(loadPageModel(`/r/${code}`)).rejects.toEqual({
      notFound: true,
    });
    expect(mocks.isParleySession).toHaveBeenCalledTimes(1);
    expect(mocks.policy).not.toHaveBeenCalled();
  });

  it('fails the room when the viewer policy read fails', async () => {
    signIn('guest');
    mocks.policy.mockImplementation(async (input: { isHost?: boolean }) => {
      if (input.isHost) return hostPolicy;
      throw new Error('meet_room_policy_unavailable');
    });
    await expect(loadPageModel(`/r/${code}`)).rejects.toThrow(
      'meet_room_policy_unavailable'
    );
  });
});

describe('workspace pages', () => {
  it('shows a pending invitation instead of the workspace', async () => {
    signIn('member');
    mocks.invitation.mockResolvedValue({ id: 'invite' });
    mocks.workspaceContext.mockRejectedValue({ redirect: '/' });
    const model = await loadPageModel('/workspace/meetings');
    expect(model).toMatchObject({
      kind: 'workspace-invitation',
      workspace: { kind: 'invitation', invitation: { id: 'invite' } },
    });
    expect(mocks.invitation).toHaveBeenCalledTimes(1);
  });

  it('loads the meetings list with one read of each workspace source', async () => {
    signIn('member');
    const model = await loadPageModel('/workspace/meetings');
    expect(model).toMatchObject({
      kind: 'meetings',
      workspace: {
        kind: 'workspace',
        wsId: 'workspace',
        user: { id: 'member' },
        profile: { id: 'member', display_name: 'M' },
      },
    });
    expect(mocks.invitation).toHaveBeenCalledTimes(1);
    expect(mocks.workspaceContext).toHaveBeenCalledTimes(1);
    expect(mocks.currentUser).toHaveBeenCalledTimes(1);
  });

  it('keeps a non-member out when there is no invitation', async () => {
    signIn('outsider');
    mocks.workspaceContext.mockRejectedValue({ redirect: '/' });
    await expect(loadPageModel('/workspace/meetings')).rejects.toEqual({
      redirect: '/',
    });
  });

  it('loads an active meeting detail with every lookup once', async () => {
    signIn('member');
    const model = await loadPageModel(`/workspace/meetings/${meetingId}`);
    expect(model).toMatchObject({
      kind: 'meeting',
      detail: {
        kind: 'active',
        isHost: false,
        policy: guestPolicy,
        calendarEvent: { id: 'event', start_at: 'soon' },
        durationSeconds: 3600,
      },
    });
    expect(mocks.policy).toHaveBeenCalledTimes(1);
    expect(mocks.permissions).toHaveBeenCalledTimes(1);
    expect(mocks.calendarEvent).toHaveBeenCalledTimes(1);
    expect(mocks.duration).toHaveBeenCalledTimes(1);
    expect(mocks.duration).toHaveBeenCalledWith('host');
  });

  it('returns the ended detail without calendar or duration data', async () => {
    signIn('member');
    const endedPolicy = { ...guestPolicy, ended: true };
    mocks.policy.mockResolvedValue(endedPolicy);
    mocks.permissions.mockRejectedValue(new Error('permissions down'));
    const model = await loadPageModel(`/workspace/meetings/${meetingId}`);
    expect(model).toMatchObject({
      kind: 'meeting',
      detail: { kind: 'ended', isHost: false, policy: endedPolicy },
    });
    if (model.kind !== 'meeting') throw new Error('expected a meeting');
    expect(model.detail).not.toHaveProperty('calendarEvent');
  });

  it('reports a policy failure before a permissions failure', async () => {
    signIn('member');
    mocks.policy.mockRejectedValue(new Error('policy down'));
    mocks.permissions.mockRejectedValue(new Error('permissions down'));
    await expect(
      loadPageModel(`/workspace/meetings/${meetingId}`)
    ).rejects.toThrow('policy down');
  });

  it('reports a permissions failure before a duration failure', async () => {
    signIn('member');
    mocks.permissions.mockRejectedValue(new Error('permissions down'));
    mocks.duration.mockRejectedValue(new Error('duration down'));
    await expect(
      loadPageModel(`/workspace/meetings/${meetingId}`)
    ).rejects.toThrow('permissions down');
  });
});
