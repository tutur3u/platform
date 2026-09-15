import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  single: vi.fn(),
  policy: vi.fn(),
  from: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: mocks.from }),
}));
vi.mock('@/features/meeting-ai/server/room-access', () => ({
  readMeetingRoomPolicy: mocks.policy,
}));

import { getMeetingPublicInfo } from './meeting-public-info';

const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.single.mockResolvedValue({
    data: {
      id,
      ws_id: 'workspace',
      creator_id: 'host',
      name: 'Demo',
      time: '2026-09-15T12:00:00Z',
      privateNotes: 'Secret',
    },
    error: null,
  });
  mocks.policy.mockResolvedValue({
    settings: { publicLinkPreview: true },
    ended: false,
  });
});
it('returns an allowlisted projection after checking persisted host consent', async () => {
  expect(await getMeetingPublicInfo(id)).toEqual({
    title: 'Demo',
    scheduledAt: '2026-09-15T12:00:00Z',
    ended: false,
  });
  expect(mocks.policy).toHaveBeenCalledWith({
    meetingId: id,
    wsId: 'workspace',
    userId: 'host',
    isHost: true,
  });
});
it.each([{}, { publicLinkPreview: false }])(
  'keeps legacy and disabled visibility private',
  async (settings) => {
    mocks.policy.mockResolvedValue({ settings });
    expect(await getMeetingPublicInfo(id)).toBeNull();
  }
);
it('fails closed when policy storage is unavailable', async () => {
  mocks.policy.mockRejectedValue(new Error('unavailable'));
  expect(await getMeetingPublicInfo(id)).toBeNull();
});
it('rejects malformed codes before database access', async () => {
  expect(await getMeetingPublicInfo('invalid')).toBeNull();
  expect(mocks.from).not.toHaveBeenCalled();
});
