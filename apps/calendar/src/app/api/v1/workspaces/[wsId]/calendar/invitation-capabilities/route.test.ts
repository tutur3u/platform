import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  source: vi.fn(),
  write: vi.fn(),
  colors: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/calendar/google-color-operations/route-handlers', () => ({
  googleColorOperationModeEnabled: () =>
    process.env.CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED === 'true',
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: mocks.source,
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createExternalCalendarEvent: mocks.write,
}));
vi.mock('@/lib/calendar/google-source-color-refresh', () => ({
  refreshOwnedGoogleSourceColor: mocks.colors,
}));
import { connection } from 'next/server';
import { GET } from './route';
const wsId = '00000000-0000-4000-8000-000000000001';
const connectionId = '00000000-0000-4000-8000-000000000002';
const params = { params: Promise.resolve({ wsId }) };
const request = (query = `provider=google&connectionId=${connectionId}`) =>
  new Request(`https://calendar.test/capabilities?${query}`);
describe('invitation create capability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'false');
    mocks.authorize.mockResolvedValue({ sbAdmin: {}, wsId, userId: 'actor' });
    mocks.source.mockResolvedValue({
      provider: 'google',
      connectionId,
      externalCalendarId: 'selected',
      accessToken: 'private-token',
      accountEmail: 'private-account',
    });
  });
  it.each(['google', 'microsoft'])(
    'returns only explicit %s capability and selected identifiers without provider calls',
    async (provider) => {
      mocks.source.mockResolvedValue({
        provider,
        connectionId,
        externalCalendarId: 'selected',
        accessToken: 'private-token',
      });
      const response = await GET(
        request(`provider=${provider}&connectionId=${connectionId}`),
        params
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        provider,
        connectionId,
        calendarId: 'selected',
        invitationCreates: true,
      });
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(connection).toHaveBeenCalled();
      expect(mocks.source).toHaveBeenCalledWith({
        sbAdmin: {},
        wsId,
        userId: 'actor',
        source: { provider, connectionId },
      });
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.colors).not.toHaveBeenCalled();
    }
  );
  it.each([401, 403])('preserves authorization denial %s', async (status) => {
    mocks.authorize.mockResolvedValue({ error: Response.json({}, { status }) });
    expect((await GET(request(), params)).status).toBe(status);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'provider=tuturuuu',
    `provider=unknown&connectionId=${connectionId}`,
    'provider=google&connectionId=forged',
    `provider=google&connectionId=${connectionId}&provider=microsoft`,
    `provider=google&connectionId=${connectionId}&connectionId=${connectionId}`,
    `provider=google&connectionId=${connectionId}&calendarId=forged`,
  ])('rejects strict query %s', async (query) => {
    expect((await GET(request(query), params)).status).toBe(400);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it.each([
    'read-only',
    'foreign actor',
    'foreign workspace',
    'provider mismatch',
  ])('hides unavailable source errors: %s', async (reason) => {
    mocks.source.mockRejectedValue(new Error(`private-token ${reason}`));
    const response = await GET(request(), params);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Invitation source unavailable',
    });
  });
  it('refuses a mismatched resolved provider', async () => {
    mocks.source.mockResolvedValue({ provider: 'microsoft', connectionId });
    expect((await GET(request(), params)).status).toBe(403);
  });
  it('advertises unavailable while legacy generation is enabled', async () => {
    vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'true');
    expect(await (await GET(request(), params)).json()).toEqual({
      provider: 'google',
      connectionId,
      calendarId: 'selected',
      invitationCreates: false,
    });
  });
});
