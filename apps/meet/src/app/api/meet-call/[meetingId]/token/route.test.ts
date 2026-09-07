import { verifyMeetRealtimeToken } from '@tuturuuu/realtime/meet/token';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), locale: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/constants', () => ({
  LOCALE_COOKIE_NAME: 'NEXT_LOCALE',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.locale }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations:
    async ({ locale }: { locale: string }) =>
    () =>
      locale === 'vi' ? 'Khách' : 'Guest',
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
import { POST } from './route';

const id = '00000000-0000-4000-8000-000000000001';
const context = { params: Promise.resolve({ meetingId: id }) };
const secret = 'meet-guest-refresh-test-secret';
function request(origin = 'https://meet.tuturuuu.com') {
  return new Request(`https://meet.tuturuuu.com/api/meet-call/${id}/token`, {
    method: 'POST',
    headers: { origin },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', secret);
  mocks.access.mockResolvedValue({
    user: { id, email: 'external@example.com' },
    meeting: { id, ws_id: id },
    isHost: false,
    canReadWorkspace: false,
    admission: 'lobby',
    displayName: 'Guest Display Name',
    workspaceSlug: 'workspace',
  });
});
afterEach(() => vi.unstubAllEnvs());

it('refreshes an external guest as a lobby speaker for this meeting only', async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const { token } = await response.json();
  expect(verifyMeetRealtimeToken(token, secret)).toMatchObject({
    admission: 'lobby',
    role: 'speaker',
    displayName: 'Guest Display Name',
    meetingId: id,
    wsId: id,
    userId: id,
  });
  expect(mocks.access).toHaveBeenCalledWith(id, 'Guest');
});

it('keeps the host out of the lobby', async () => {
  mocks.access.mockResolvedValue({
    user: { id },
    meeting: { id, ws_id: id },
    isHost: true,
    canReadWorkspace: true,
    admission: 'open',
    displayName: 'Host Display Name',
    workspaceSlug: 'personal',
  });
  const { token } = await (await POST(request(), context)).json();
  expect(verifyMeetRealtimeToken(token, secret)).toMatchObject({
    admission: 'open',
    role: 'host',
  });
});

it('rejects cross-origin refreshes before checking access', async () => {
  expect((await POST(request('https://other.example'), context)).status).toBe(
    403
  );
  expect(mocks.access).not.toHaveBeenCalled();
});

it('rechecks authorization on every refresh', async () => {
  mocks.access.mockRejectedValue(
    new MeetCallAccessError(401, 'Sign in to join')
  );
  expect((await POST(request(), context)).status).toBe(401);
});

it('preserves the Vietnamese fallback locale during refresh', async () => {
  mocks.locale.mockReturnValue({ value: 'vi' });
  await POST(request(), context);
  expect(mocks.access).toHaveBeenCalledWith(id, 'Khách');
});
