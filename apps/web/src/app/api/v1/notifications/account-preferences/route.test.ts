import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookie: false,
  actor: 'synthetic-user',
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  is: vi.fn(),
  eq: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async (client) => ({
    user: client.user,
    authError: null,
  })),
}));
vi.mock(
  '@/legacy-api-routes/v1/notifications/notification-preferences-write',
  () => ({
    saveNotificationPreferences: mocks.save,
  })
);

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(async () => {}),
}));

import { GET, HEAD, PUT } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie = false;
  mocks.actor = 'synthetic-user';
  mocks.createClient.mockImplementation(async (request?: Request) => ({
    user:
      mocks.cookie ||
      request?.headers.get('authorization') === 'Bearer synthetic-valid'
        ? { id: mocks.actor }
        : null,
    from: mocks.from,
  }));
  mocks.createAdminClient.mockResolvedValue({});
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ is: mocks.is });
  mocks.is.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ data: [], error: null });
  mocks.save.mockResolvedValue(null);
});

function request(method: string, authenticated = true) {
  return new Request(
    'https://example.test/api/v1/notifications/account-preferences',
    {
      method,
      headers: authenticated ? { authorization: 'Bearer synthetic-valid' } : {},
      ...(method === 'PUT'
        ? {
            body: JSON.stringify({
              preferences: [
                {
                  eventType: 'push_notifications',
                  channel: 'push',
                  enabled: false,
                },
              ],
            }),
          }
        : {}),
    }
  );
}

describe('account notification preference authentication', () => {
  it.each([
    ['GET', GET],
    ['PUT', PUT],
  ] as const)(
    '%s accepts mobile bearer authentication',
    async (method, handler) => {
      const incoming = request(method);
      expect((await handler(incoming)).status).toBe(200);
      expect(mocks.createClient).toHaveBeenCalledWith(incoming);
    }
  );
  it('retains cookie authentication and scopes reads to the current account', async () => {
    mocks.cookie = true;
    mocks.actor = 'synthetic-second-user';
    expect((await GET(request('GET', false))).status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('notification_preferences');
    expect(mocks.is).toHaveBeenCalledWith('ws_id', null);
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'synthetic-second-user');
  });
  it.each([
    ['GET', GET],
    ['PUT', PUT],
  ] as const)(
    '%s rejects unauthenticated requests before accessing preferences',
    async (method, handler) => {
      expect((await handler(request(method, false))).status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(mocks.save).not.toHaveBeenCalled();
    }
  );
});

it('HEAD authenticates the same actor without returning preference content', async () => {
  const response = await HEAD(request('HEAD'));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('');
});

it('writes only account preferences for the authenticated actor', async () => {
  mocks.actor = 'synthetic-second-user';
  expect((await PUT(request('PUT'))).status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: 'user',
      userId: 'synthetic-second-user',
      wsId: null,
      preferences: [
        { eventType: 'push_notifications', channel: 'push', enabled: false },
      ],
    })
  );
});

it('rejects invalid preferences before obtaining the admin writer', async () => {
  const incoming = new Request('https://example.test/account-preferences', {
    method: 'PUT',
    headers: { authorization: 'Bearer synthetic-valid' },
    body: JSON.stringify({
      preferences: [{ eventType: 'unknown', channel: 'push', enabled: false }],
    }),
  });
  expect((await PUT(incoming)).status).toBe(400);
  expect(mocks.createAdminClient).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
