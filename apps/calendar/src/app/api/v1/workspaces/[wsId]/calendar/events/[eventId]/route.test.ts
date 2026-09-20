import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  decryptEvent: vi.fn(),
  deleteProviderEvent: vi.fn(),
  encryptEvent: vi.fn(),
  getSyncPreferences: vi.fn(),
  getWorkspaceKey: vi.fn(),
  resolveEventSource: vi.fn(),
  resolveOutboundSource: vi.fn(),
  upsertHabitSkip: vi.fn(),
}));

vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@/lib/calendar/habit-skips', () => ({
  upsertHabitSkip: mocks.upsertHabitSkip,
}));
vi.mock('@/lib/calendar/provider-writes', () => ({
  createProviderEvent: vi.fn(),
  deleteProviderEvent: mocks.deleteProviderEvent,
  moveProviderEvent: vi.fn(),
  updateProviderEvent: vi.fn(),
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: vi.fn(),
  resolveCalendarSourceForEvent: mocks.resolveEventSource,
}));
vi.mock('@/lib/calendar/sync-preferences', () => ({
  getCalendarSyncPreferences: mocks.getSyncPreferences,
  resolveOutboundSyncSource: mocks.resolveOutboundSource,
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventFromStorage: mocks.decryptEvent,
  encryptEventForStorage: mocks.encryptEvent,
  getWorkspaceKey: mocks.getWorkspaceKey,
}));

import { DELETE, GET, PUT } from './route';

const WS_ID = '00000000-0000-4000-8000-000000008611';
const EVENT_ID = '00000000-0000-4000-8000-000000008621';

function params() {
  return { params: Promise.resolve({ wsId: WS_ID, eventId: EVENT_ID }) };
}

function request(method: string, body?: unknown) {
  return new Request(`https://calendar.test/events/${EVENT_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
  });
}

function chainResult(result: unknown) {
  const chain: any = {
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => chain),
    single: vi.fn(async () => result),
    update: vi.fn(() => chain),
  };
  return chain;
}

describe('workspace calendar event item authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decryptEvent.mockImplementation(async (event) => event);
    mocks.getWorkspaceKey.mockResolvedValue(null);
    mocks.resolveEventSource.mockResolvedValue({
      provider: 'tuturuuu',
      workspaceCalendarId: null,
    });
    mocks.getSyncPreferences.mockResolvedValue({ settingsAvailable: false });
    mocks.resolveOutboundSource.mockResolvedValue(null);
  });

  it.each([
    ['GET', GET],
    ['PUT', PUT],
    ['DELETE', DELETE],
  ])(
    'returns denial before parsing or querying for %s',
    async (method, handler) => {
      mocks.authorize.mockResolvedValue({
        error: Response.json({ error: 'Forbidden' }, { status: 403 }),
      });
      const req = request(
        method,
        method === 'PUT' ? { locked: true } : undefined
      );
      const jsonSpy = vi.spyOn(req, 'json');

      const response = await handler(req, params());

      expect(response.status).toBe(403);
      expect(jsonSpy).not.toHaveBeenCalled();
      expect(mocks.decryptEvent).not.toHaveBeenCalled();
      expect(mocks.deleteProviderEvent).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['PUT', PUT],
    ['DELETE', DELETE],
  ])(
    'blocks %s while invitation delivery is pending',
    async (method, handler) => {
      const existing = chainResult({
        data: {
          id: EVENT_ID,
          provider: 'google',
          scheduling_metadata: { meeting_delivery: 'pending' },
        },
        error: null,
      });
      const from = vi.fn(() => existing);
      mocks.authorize.mockResolvedValue({
        sbAdmin: { from },
        userId: 'user-1',
        wsId: WS_ID,
      });
      const response = await handler(
        request(method, method === 'PUT' ? { locked: true } : undefined),
        params()
      );
      expect(response.status).toBe(409);
      expect(existing.update).not.toHaveBeenCalled();
      expect(existing.delete).not.toHaveBeenCalled();
      expect(mocks.deleteProviderEvent).not.toHaveBeenCalled();
      expect(mocks.resolveEventSource).not.toHaveBeenCalled();
      expect(from).toHaveBeenCalledTimes(1);
    }
  );

  it('preserves authorized GET response', async () => {
    const event = { id: EVENT_ID, provider: 'tuturuuu', title: 'Planning' };
    const existing = chainResult({ data: event, error: null });
    mocks.authorize.mockResolvedValue({
      sbAdmin: { from: vi.fn(() => existing) },
      userId: 'user-1',
      wsId: WS_ID,
    });

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(event);
  });

  it.each([undefined, 'blue', ' Blue '])(
    'preserves PUT and canonicalizes color %s',
    async (color) => {
      const existingEvent = {
        id: EVENT_ID,
        provider: 'tuturuuu',
        title: 'Planning',
        description: '',
        location: '',
        start_at: '2026-08-10T09:00:00.000Z',
        end_at: '2026-08-10T10:00:00.000Z',
        is_encrypted: false,
      };
      const existing = chainResult({ data: existingEvent, error: null });
      const updated = chainResult({
        data: { ...existingEvent, locked: true },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(existing)
        .mockReturnValueOnce(updated);
      mocks.authorize.mockResolvedValue({
        sbAdmin: { from },
        userId: 'user-1',
        wsId: WS_ID,
      });

      const response = await PUT(
        request('PUT', { locked: true, color }),
        params()
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.objectContaining({ id: EVENT_ID, locked: true })
      );
      expect(updated.update).toHaveBeenCalledWith({
        locked: true,
        ...(color === undefined ? {} : { color: 'BLUE' }),
      });
    }
  );

  it('rejects invalid update colors before reading or writing events', async () => {
    const from = vi.fn();
    mocks.authorize.mockResolvedValue({
      sbAdmin: { from },
      userId: 'user-1',
      wsId: WS_ID,
    });
    const response = await PUT(request('PUT', { color: 'invalid' }), params());
    expect(response.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('preserves authorized DELETE response', async () => {
    const existing = chainResult({
      data: { id: EVENT_ID, provider: 'tuturuuu' },
      error: null,
    });
    const linkedHabit = chainResult({ data: null, error: null });
    const linkedTask = chainResult({ data: null, error: null });
    const removed = chainResult({ error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(existing)
      .mockReturnValueOnce(linkedHabit)
      .mockReturnValueOnce(linkedTask)
      .mockReturnValueOnce(removed);
    mocks.authorize.mockResolvedValue({
      sbAdmin: { from },
      userId: 'user-1',
      wsId: WS_ID,
    });

    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      linkedTaskId: null,
      message: 'Event deleted successfully',
      skippedHabitDate: null,
      skippedHabitId: null,
    });
    expect(removed.delete).toHaveBeenCalledOnce();
  });
});
