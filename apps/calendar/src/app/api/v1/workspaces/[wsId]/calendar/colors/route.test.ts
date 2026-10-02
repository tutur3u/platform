import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  source: vi.fn(),
  options: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@/lib/calendar/google-color-operations/route-handlers', () => ({
  googleColorOperationModeEnabled: () =>
    process.env.CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED === 'true',
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: vi.fn(() => ({})) },
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: mocks.source,
}));
vi.mock('@/lib/calendar/google-source-color-refresh', () => ({
  refreshOwnedGoogleSourceColor: vi.fn(),
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createGoogleAuthClient: mocks.auth,
}));
vi.mock('@/lib/calendar/google-color-choices', async (original) => ({
  ...(await original<typeof import('@/lib/calendar/google-color-choices')>()),
  loadGoogleColorOptions: mocks.options,
}));

import { GoogleColorChoiceError } from '@/lib/calendar/google-color-choices';
import { GET } from './route';

const wsId = '00000000-0000-4000-8000-000000000001',
  connectionId = '00000000-0000-4000-8000-000000000002';
function request(query = `connectionId=${connectionId}`) {
  return new Request(`https://calendar.test/colors?${query}`);
}
function params() {
  return { params: Promise.resolve({ wsId }) };
}
describe('Google color options API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ sbAdmin: {}, wsId, userId: 'actor' });
    mocks.source.mockResolvedValue({ provider: 'google', connectionId });
    mocks.options.mockResolvedValue({
      options: {
        provider: 'google',
        connectionId,
        sourceColor: { background: '#d06b64', foreground: null },
        options: [],
      },
    });
  });
  it('denies before parsing or resolving an actor source', async () => {
    mocks.authorize.mockResolvedValue({
      error: Response.json({}, { status: 403 }),
    });
    expect((await GET(request('bad'), params())).status).toBe(403);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it.each([
    '',
    'connectionId=bad',
    `connectionId=${connectionId}&background=%23ffffff`,
    `connectionId=${connectionId}&connectionId=${connectionId}`,
  ])('rejects invalid query %s', async (query) => {
    expect((await GET(request(query), params())).status).toBe(400);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it('binds live options to normalized workspace and actor writable source', async () => {
    const response = await GET(request(), params());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.source).toHaveBeenCalledWith({
      sbAdmin: {},
      wsId,
      userId: 'actor',
      source: { provider: 'google', connectionId },
    });
  });
  it('rejects unavailable or read-only sources before Google reads', async () => {
    mocks.source.mockRejectedValueOnce(
      new Error('Selected calendar source is unavailable or read-only')
    );
    expect((await GET(request(), params())).status).toBe(403);
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it('surfaces provider failure without inventing selectable colors', async () => {
    mocks.options.mockRejectedValueOnce(
      new GoogleColorChoiceError('Google color palette is unavailable', 502)
    );
    expect((await GET(request(), params())).status).toBe(502);
  });
});

it('does not advertise new provider-color choices while candidate writes are disabled', async () => {
  vi.stubEnv('CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED', 'false');
  mocks.authorize.mockResolvedValue({ sbAdmin: {}, wsId, userId: 'actor' });
  mocks.source.mockResolvedValue({ provider: 'google', connectionId });
  mocks.options.mockResolvedValue({
    options: {
      provider: 'google',
      connectionId,
      sourceColor: { background: '#d06b64', foreground: null },
      options: [{ kind: 'label', id: 'opaque' }],
    },
  });
  const response = await GET(request(), params());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    options: [],
    providerColorWrites: false,
  });
  vi.unstubAllEnvs();
});
