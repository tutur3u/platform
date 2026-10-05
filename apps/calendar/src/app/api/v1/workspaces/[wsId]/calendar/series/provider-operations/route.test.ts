import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  reserve: vi.fn(),
  execute: vi.fn(),
  capabilities: vi.fn(),
}));
vi.mock('next/server', () => ({
  connection: vi.fn(),
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@/lib/calendar/recurrence/provider/request-service', () => ({
  reserveProviderOperation: mocks.reserve,
  executeRequestProviderOperation: mocks.execute,
}));
vi.mock('@/lib/calendar/recurrence/provider/http', () => ({
  providerOperationFailure: () =>
    Response.json({ error: 'Unavailable' }, { status: 503 }),
}));
vi.mock('@/lib/calendar/recurrence/http', () => ({
  readJson: (request: Request) => request.json(),
}));

vi.mock('@/lib/calendar/recurrence/provider/capabilities', () => ({
  providerSeriesCapabilities: mocks.capabilities,
}));

import { GET, POST } from './route';

const invoke = () =>
  POST(
    new Request('https://calendar.invalid/api', { method: 'POST', body: '{}' }),
    { params: Promise.resolve({ wsId: 'workspace' }) }
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'false');
  mocks.authorize.mockResolvedValue({
    wsId: 'workspace',
    userId: 'actor',
    sbAdmin: {},
  });
  mocks.reserve.mockResolvedValue({ id: 'operation' });
});

describe('provider recurrence admission', () => {
  it('requires membership and management permission before the feature gate', async () => {
    mocks.authorize.mockResolvedValue({
      error: Response.json({ error: 'Denied' }, { status: 403 }),
    });
    expect((await invoke()).status).toBe(403);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('does not admit operations while inbound parity is disabled', async () => {
    const response = await invoke();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'PROVIDER_SERIES_DISABLED',
    });
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each([
    ['pending', 202],
    ['applied', 200],
  ] as const)('reports %s honestly', async (status, expected) => {
    vi.stubEnv('CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED', 'true');
    mocks.execute.mockResolvedValue({ operationId: 'operation', status });
    const response = await invoke();
    expect(response.status).toBe(expected);
    expect(await response.json()).toEqual({ operationId: 'operation', status });
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'actor', wsId: 'workspace' }),
      'operation'
    );
  });
});

describe('provider capability visibility', () => {
  it('requires calendar management before exposing connection configuration', async () => {
    mocks.authorize.mockResolvedValue({
      error: Response.json({}, { status: 403 }),
    });
    expect(
      (
        await GET(new Request('https://calendar.invalid/api'), {
          params: Promise.resolve({ wsId: 'workspace' }),
        })
      ).status
    ).toBe(403);
    expect(mocks.capabilities).not.toHaveBeenCalled();
  });
  it('marks capabilities private and never cacheable across actors', async () => {
    mocks.capabilities.mockResolvedValue({ enabled: false, sources: [] });
    const response = await GET(new Request('https://calendar.invalid/api'), {
      params: Promise.resolve({ wsId: 'workspace' }),
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ enabled: false, sources: [] });
  });
});
