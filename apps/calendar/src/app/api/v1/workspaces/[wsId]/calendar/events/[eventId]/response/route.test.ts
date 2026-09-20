import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  resolve: vi.fn(),
  respond: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  one: vi.fn(),
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSourceForEvent: mocks.resolve,
}));
vi.mock('@/lib/calendar/meeting-provider-response', async (original) => ({
  ...(await original<
    typeof import('@/lib/calendar/meeting-provider-response')
  >()),
  respondToProviderMeeting: mocks.respond,
}));

import { POST } from './route';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const event = {
  id: eventId,
  ws_id: 'resolved-workspace',
  external_event_id: 'provider-event',
};
const source = { provider: 'google', accountEmail: 'guest@example.com' };
function request(body: unknown = { response: 'accepted' }, id = eventId) {
  return POST(
    new Request('https://calendar.example.com/response', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'personal', eventId: id }) }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.one });
  mocks.one.mockResolvedValue({ data: event, error: null });
  mocks.authorize.mockResolvedValue({
    sbAdmin: { from: mocks.from },
    wsId: 'resolved-workspace',
    userId: 'actor',
  });
  mocks.resolve.mockResolvedValue(source);
  mocks.respond.mockResolvedValue(undefined);
});
describe('authenticated meeting responses', () => {
  it.each([401, 403])(
    'rejects unauthorized requests before reading event data (%s)',
    async (status) => {
      mocks.authorize.mockResolvedValueOnce({
        error: Response.json({ error: 'Denied' }, { status }),
      });
      expect((await request()).status).toBe(status);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.respond).not.toHaveBeenCalled();
    }
  );
  it.each(['accepted', 'declined', 'tentative'])(
    'responds as the authenticated connected account: %s',
    async (response) => {
      const result = await request({ response });
      expect(result.status).toBe(200);
      expect(result.headers.get('cache-control')).toBe('private, no-store');
      expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'resolved-workspace');
      expect(mocks.eq).toHaveBeenCalledWith('id', eventId);
      expect(mocks.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor',
          wsId: 'resolved-workspace',
          event,
        })
      );
      expect(mocks.respond).toHaveBeenCalledWith({
        source,
        externalEventId: 'provider-event',
        response,
      });
    }
  );
  it.each([
    {},
    { response: 'needsAction' },
    { response: 'accepted', email: 'spoof@example.com' },
    { response: 'accepted', userId: 'another-user' },
    '{bad json',
  ])('rejects invalid or identity-bearing input', async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it('rejects invalid identifiers before querying storage', async () => {
    expect((await request({ response: 'accepted' }, '../other')).status).toBe(
      400
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not resolve accounts for an event absent from this workspace', async () => {
    mocks.one.mockResolvedValueOnce({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
  it('rejects an unconnected invitation without claiming successful delivery', async () => {
    mocks.resolve.mockResolvedValueOnce({ provider: 'tuturuuu' });
    expect((await request()).status).toBe(409);
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it('does not retry a provider failure or expose its diagnostics', async () => {
    mocks.respond.mockRejectedValueOnce(
      new Error('private provider diagnostic')
    );
    const result = await request();
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain('private provider diagnostic');
    expect(mocks.respond).toHaveBeenCalledTimes(1);
  });
});
