import { beforeEach, expect, it, vi } from 'vitest';
import { encodeRoomCode } from '@/features/call/lib/room-code';

const mocks = vi.hoisted(() => ({ access: vi.fn(), session: vi.fn() }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/features/call/components/participant-name-form', () => ({
  ParticipantNameForm: () => null,
}));
vi.mock('@/features/call/components/call-shell', () => ({
  CallShell: () => null,
}));
vi.mock('@/features/call/lib/call-session', () => ({
  getMeetCallSession: mocks.session,
}));
vi.mock('@/features/call/lib/call-access', () => ({
  getMeetCallAccess: mocks.access,
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { MeetCallAccessError } from '@/features/call/lib/call-access';
import RoomPage from './page';

const id = '00000000-0000-4000-8000-000000000001';
const code = encodeRoomCode(id);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    user: { id, email: 'guest@example.com' },
    meeting: { id, ws_id: id, name: 'Invited call' },
    isHost: false,
    canReadWorkspace: false,
    admission: 'lobby',
    displayName: 'Guest Display Name',
    workspaceSlug: 'workspace',
  });
  mocks.session.mockResolvedValue({
    displayName: 'Guest',
    token: 'test-token',
    realtimeUrl: 'wss://meet.example',
  });
});

it('renders the invited call for a non-member after sign-in', async () => {
  const result = await RoomPage({
    params: Promise.resolve({ code, locale: 'en' }),
  });
  expect(result.props).toMatchObject({
    meetingId: id,
    meetingName: 'Invited call',
    canReadWorkspace: false,
    leaveHref: '/',
  });
  expect(mocks.session).toHaveBeenCalledWith(
    expect.objectContaining({
      admission: 'lobby',
      isHost: false,
      displayName: 'Guest Display Name',
    })
  );
});

it('leaves a personal workspace call through its canonical URL', async () => {
  mocks.access.mockResolvedValue({
    user: { id },
    meeting: { id, ws_id: id },
    isHost: true,
    canReadWorkspace: true,
    admission: 'open',
    displayName: 'Host',
    workspaceSlug: 'personal',
  });
  const result = await RoomPage({
    params: Promise.resolve({ code, locale: 'en' }),
  });
  expect(result.props.leaveHref).toBe(`/personal/meetings/${id}`);
});

it.each(['en', 'vi'])(
  'preserves the localized invite through sign-in: %s',
  async (locale) => {
    mocks.access.mockRejectedValue(
      new MeetCallAccessError(401, 'Sign in to join')
    );
    const target = `${locale === 'en' ? '' : '/vi'}/r/${code}`;
    await expect(
      RoomPage({ params: Promise.resolve({ code, locale }) })
    ).rejects.toThrow(`redirect:/login?next=${encodeURIComponent(target)}`);
  }
);

it('does not turn a forbidden invite into an unrelated home-page redirect', async () => {
  mocks.access.mockRejectedValue(
    new MeetCallAccessError(403, 'Guest access unavailable')
  );
  await expect(
    RoomPage({ params: Promise.resolve({ code, locale: 'en' }) })
  ).rejects.toThrow('not-found');
});

it('returns workspace guests to home without opening the meeting archive', async () => {
  mocks.access.mockResolvedValue({
    user: { id },
    meeting: { id, ws_id: id },
    isHost: false,
    canReadWorkspace: false,
    admission: 'open',
    displayName: 'Collaborator',
    workspaceSlug: 'internal',
  });
  const result = await RoomPage({
    params: Promise.resolve({ code, locale: 'en' }),
  });
  expect(result.props.leaveHref).toBe('/');
});

it('asks for a missing name before creating the realtime session', async () => {
  mocks.access.mockResolvedValue({
    user: { id },
    meeting: { id, ws_id: id, name: 'Invited call' },
    canReadWorkspace: false,
    needsDisplayName: true,
  });
  const result = await RoomPage({
    params: Promise.resolve({ code, locale: 'en' }),
  });
  expect(result.props).toMatchObject({
    meetingName: 'Invited call',
    leaveHref: '/',
  });
  expect(mocks.session).not.toHaveBeenCalled();
});
