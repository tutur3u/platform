import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MeetCallAccessError extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  }
  return {
    MeetCallAccessError,
    guestAccess: vi.fn(),
    session: vi.fn(),
  };
});
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => ({
  MeetCallAccessError: mocks.MeetCallAccessError,
  getMeetCallAccess: async () => {
    throw new mocks.MeetCallAccessError(401, 'Sign in');
  },
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-access', () => ({
  getMeetGuestCallAccess: mocks.guestAccess,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-session', () => ({
  getMeetCallSession: mocks.session,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/class-role', () => ({
  resolveMeetClassRole: async () => ({
    coHost: false,
    participantKind: 'guest',
  }),
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/meeting-duration', () => ({
  getHostMeetingDurationSeconds: async () => 3600,
  getParticipantStreamTier: async () => 'free',
}));
vi.mock('@tuturuuu/satellite/constants', () => ({
  LOCALE_COOKIE_NAME: 'NEXT_LOCALE',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'signed-guest' }) }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

import { POST } from './route';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const params = { params: Promise.resolve({ meetingId }) };
const request = () =>
  new Request(`https://meet.test/api/meet-call/${meetingId}/token`, {
    method: 'POST',
    headers: {
      origin: 'https://meet.test',
      'content-type': 'application/json',
    },
    body: '{}',
  });

function guest(verified: boolean) {
  return {
    guest: true,
    ...(verified ? { turnstileVerified: true } : {}),
    user: { id: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691' },
    meeting: { id: meetingId, ws_id: 'ws', creator_id: 'host' },
    isHost: false,
    displayName: 'Guest',
    avatarUrl: undefined,
    admission: 'lobby',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    token: 't',
    realtimeUrl: 'wss://rt.test/realtime',
  });
});

it('carries a verified guest session into the realtime token', async () => {
  mocks.guestAccess.mockResolvedValue(guest(true));
  const response = await POST(request(), params);
  expect(response.status).toBe(200);
  expect(mocks.session).toHaveBeenCalledWith(
    expect.objectContaining({ guest: true, guestTurnstileVerified: true })
  );
});

it('leaves an unverified guest unverified', async () => {
  mocks.guestAccess.mockResolvedValue(guest(false));
  await POST(request(), params);
  expect(mocks.session.mock.calls[0]?.[0]).not.toHaveProperty(
    'guestTurnstileVerified'
  );
});
