import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  meeting: vi.fn(),
  permissions: vi.fn(),
  policy: vi.fn(),
  calendar: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('../../workspace-context', () => ({
  getMeetWorkspaceContext: mocks.context,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const query = { select: () => query, eq: mocks.eq, single: mocks.meeting };
    mocks.eq.mockReturnValue(query);
    return { from: () => query };
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@/features/meeting-ai/server/room-access', () => ({
  readMeetingRoomPolicy: mocks.policy,
}));
vi.mock('./meeting-calendar-event', () => ({
  loadMeetingCalendarEvent: mocks.calendar,
}));
vi.mock('@/constants/common', () => ({
  CALENDAR_URL: 'https://calendar.example.test',
}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not_found');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('@tuturuuu/icons', () => ({
  ArrowLeft: () => null,
  Calendar: () => null,
  Clock: () => null,
  ExternalLink: () => null,
  Users: () => null,
  Video: () => null,
}));
vi.mock('@tuturuuu/ui/button', () => ({ Button: () => null }));
vi.mock('@tuturuuu/ui/card', () => ({
  Card: () => null,
  CardContent: () => null,
  CardDescription: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
}));
vi.mock('@/features/call/components/call-ended', () => ({
  CallEnded: () => null,
}));
vi.mock('@/features/call/components/meeting-duration-info', () => ({
  MeetingDurationInfo: () => null,
}));
vi.mock('@/features/call/components/meeting-local-time', () => ({
  MeetingLocalTime: () => null,
}));
vi.mock('@/features/call/components/meeting-public-settings', () => ({
  MeetingPublicSettings: () => null,
}));
vi.mock('@/features/meeting-ai/meeting-ai-overview', () => ({
  MeetingAiOverview: () => null,
}));
vi.mock('./meeting-actions', () => ({ MeetingActions: () => null }));
vi.mock('./recording-sessions-overview', () => ({
  RecordingSessionsOverview: () => null,
}));

import MeetingDetailPage from './page';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const actor = { id: 'actor-id' };
const permission = { withoutPermission: () => false };
const active = { ended: false, canReadNotes: true };
const props = {
  params: Promise.resolve({
    wsId: 'personal',
    meetingId: '10000000-0000-4000-8000-000000000001',
  }),
};
async function reachPolicy() {
  await vi.waitFor(() => expect(mocks.policy).toHaveBeenCalledTimes(1));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({
    user: actor,
    wsId: 'canonical-workspace',
    workspaceSlug: 'personal',
  });
  mocks.meeting.mockResolvedValue({
    data: {
      id: '10000000-0000-4000-8000-000000000001',
      creator_id: actor.id,
      name: 'Meeting',
      creator: { display_name: 'Host' },
      time: '2026-10-05T10:00:00Z',
      created_at: '2026-10-05T09:00:00Z',
    },
    error: null,
  });
  mocks.permissions.mockResolvedValue(permission);
  mocks.policy.mockResolvedValue(active);
  mocks.calendar.mockResolvedValue(null);
});

test('starts scoped permissions while room policy is pending, without reading Calendar', async () => {
  const policy = deferred<typeof active>();
  mocks.policy.mockReturnValue(policy.promise);
  const loading = MeetingDetailPage(props);
  await reachPolicy();
  expect(mocks.permissions).toHaveBeenCalledWith({
    user: actor,
    wsId: 'canonical-workspace',
  });
  expect(mocks.eq).toHaveBeenCalledWith(
    'id',
    '10000000-0000-4000-8000-000000000001'
  );
  expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'canonical-workspace');
  expect(mocks.policy).toHaveBeenCalledWith({
    meetingId: '10000000-0000-4000-8000-000000000001',
    wsId: 'canonical-workspace',
    userId: actor.id,
    isHost: true,
  });
  expect(mocks.calendar).not.toHaveBeenCalled();
  policy.resolve(active);
  await loading;
  expect(mocks.calendar).toHaveBeenCalledWith(
    expect.objectContaining({
      permissions: permission,
      wsId: 'canonical-workspace',
      meetingId: '10000000-0000-4000-8000-000000000001',
    })
  );
});

test('active rooms wait for permission completion before Calendar access', async () => {
  const permissions = deferred<typeof permission>();
  mocks.permissions.mockReturnValue(permissions.promise);
  const loading = MeetingDetailPage(props);
  await reachPolicy();
  expect(mocks.calendar).not.toHaveBeenCalled();
  permissions.resolve(permission);
  await loading;
  expect(mocks.calendar).toHaveBeenCalledTimes(1);
});

test('ended rooms return without waiting for a pending permission read', async () => {
  mocks.permissions.mockReturnValue(new Promise(() => {}));
  mocks.policy.mockResolvedValue({ ended: true, canReadNotes: false });
  const result = await MeetingDetailPage(props);
  expect(result.props).toEqual(
    expect.objectContaining({
      meetingId: '10000000-0000-4000-8000-000000000001',
      wsId: 'canonical-workspace',
      accountId: actor.id,
    })
  );
  expect(mocks.calendar).not.toHaveBeenCalled();
});

test('ended rooms ignore a rejected permission lookup as before', async () => {
  mocks.permissions.mockRejectedValue(new Error('permission_failed'));
  mocks.policy.mockResolvedValue({ ended: true, canReadNotes: false });
  await expect(MeetingDetailPage(props)).resolves.toBeDefined();
  expect(mocks.calendar).not.toHaveBeenCalled();
});

test('room-policy failure retains precedence over a concurrent permission failure', async () => {
  const policy = deferred<typeof active>();
  mocks.policy.mockReturnValue(policy.promise);
  mocks.permissions.mockRejectedValue(new Error('permission_failed'));
  const loading = MeetingDetailPage(props);
  const rejected = expect(loading).rejects.toThrow('policy_failed');
  await reachPolicy();
  policy.reject(new Error('policy_failed'));
  await rejected;
  expect(mocks.calendar).not.toHaveBeenCalled();
});

test('active rooms propagate permission failures before Calendar reads', async () => {
  mocks.permissions.mockRejectedValue(new Error('permission_failed'));
  await expect(MeetingDetailPage(props)).rejects.toThrow('permission_failed');
  expect(mocks.calendar).not.toHaveBeenCalled();
});

test('workspace denial prevents policy, permission, and meeting reads', async () => {
  mocks.context.mockRejectedValue(new Error('workspace_denied'));
  await expect(MeetingDetailPage(props)).rejects.toThrow('workspace_denied');
  expect(mocks.meeting).not.toHaveBeenCalled();
  expect(mocks.policy).not.toHaveBeenCalled();
  expect(mocks.permissions).not.toHaveBeenCalled();
});

test.each([
  { data: null, error: null },
  { data: null, error: new Error('query_failed') },
])(
  'missing or failed scoped meetings prevent independent reads',
  async (response) => {
    mocks.meeting.mockResolvedValue(response);
    await expect(MeetingDetailPage(props)).rejects.toThrow('not_found');
    expect(mocks.policy).not.toHaveBeenCalled();
    expect(mocks.permissions).not.toHaveBeenCalled();
  }
);
