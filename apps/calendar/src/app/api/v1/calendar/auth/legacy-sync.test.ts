import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  enabled: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  google: vi.fn(),
  authorize: vi.fn(),
  members: vi.fn(),
  normalize: vi.fn(),
  from: vi.fn(),
  single: vi.fn(),
  events: [] as Record<string, unknown>[],
}));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: mocks.google },
  OAuth2Client: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('./legacy-sync-access', () => ({ authorizeLegacySync: mocks.access }));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: mocks.authorize,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.members,
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
}));
vi.mock('@/lib/calendar/google-color-operations/route-handlers', () => ({
  googleColorOperationModeEnabled: mocks.enabled,
  handleRecoverableGooglePut: mocks.put,
  handleRecoverableGoogleDelete: mocks.remove,
  unsupportedGoogleMutation: () =>
    Response.json(
      { code: 'GOOGLE_MUTATION_RECOVERY_UNAVAILABLE' },
      { status: 409 }
    ),
}));

import { DELETE, POST, PUT } from './sync/route';
import { POST as bulk } from './sync-to-google/route';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function request(body: unknown) {
  return new Request('https://calendar.example.com/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: mocks.single,
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    order: vi.fn(() => Promise.resolve({ data: mocks.events, error: null })),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    then: (resolve: (value: unknown) => void) =>
      resolve({ data: [{ calendar_id: 'linked-calendar' }], error: null }),
  };
  mocks.from.mockReturnValue(chain);
  mocks.single.mockResolvedValue({
    data: { id: 'token', access_token: 'synthetic' },
    error: null,
  });
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'actor' },
    supabase: { from: mocks.from },
  });
  mocks.access.mockResolvedValue({
    wsId: 'trusted-workspace',
    event: { id: eventId },
  });
  mocks.authorize.mockResolvedValue({ wsId: 'trusted-workspace' });
  mocks.members.mockResolvedValue({ ok: true });
  mocks.normalize.mockResolvedValue('trusted-workspace');
  mocks.enabled.mockReturnValue(true);
  mocks.put.mockResolvedValue(Response.json({ id: eventId }));
  mocks.remove.mockResolvedValue(Response.json({ deleted: true }));
  mocks.events = [
    { id: eventId, google_event_id: 'remote', locked: false, title: 'Title' },
  ];
});
it('rejects candidate creation before constructing a provider client', async () => {
  expect((await POST(request({ event: { id: eventId } }))).status).toBe(409);
  expect(mocks.google).not.toHaveBeenCalled();
});
it('dispatches update with freshly resolved workspace/local identity and no second local write', async () => {
  const req = request({
    eventId,
    googleCalendarEventId: 'remote',
    eventUpdates: { title: 'Updated' },
  });
  expect((await PUT(req)).status).toBe(200);
  expect(mocks.put).toHaveBeenCalledWith({
    request: req,
    rawWsId: 'trusted-workspace',
    eventId,
    updates: { title: 'Updated' },
  });
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});
it('dispatches delete without a provider-ID override or local second delete', async () => {
  expect(
    (await DELETE(request({ eventId, googleCalendarEventId: 'remote' }))).status
  ).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith(
    expect.objectContaining({ rawWsId: 'trusted-workspace', eventId })
  );
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.from).not.toHaveBeenCalled();
});
it('returns authorization denial before mutation admission', async () => {
  mocks.access.mockResolvedValue({ error: Response.json({}, { status: 403 }) });
  expect(
    (
      await PUT(
        request({
          eventId,
          googleCalendarEventId: 'remote',
          eventUpdates: { title: 'x' },
        })
      )
    ).status
  ).toBe(403);
  expect(mocks.put).not.toHaveBeenCalled();
});
it('preflights unsupported creation across the entire bulk before the first dispatch', async () => {
  mocks.events.push({ id: 'another', locked: false, google_event_id: null });
  expect(
    (
      await bulk(
        request({
          wsId: 'personal',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
        })
      )
    ).status
  ).toBe(409);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.google).not.toHaveBeenCalled();
});
it('stops bulk on a recoverable conflict without fallback insert', async () => {
  mocks.put.mockResolvedValue(
    Response.json({ operationId: 'pending' }, { status: 409 })
  );
  expect(
    (
      await bulk(
        request({
          wsId: 'personal',
          startDate: '2026-10-01',
          endDate: '2026-10-02',
        })
      )
    ).status
  ).toBe(409);
  expect(mocks.put).toHaveBeenCalledTimes(1);
  expect(mocks.google).not.toHaveBeenCalled();
});
