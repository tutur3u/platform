import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { dispatchMeetEndpoint } from '../../../../../runtime/api-registry';

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle,
  };
  return {
    query,
    createAdminClient: vi.fn(() => ({ from: vi.fn(() => query) })),
    route: vi.fn(),
    service: vi.fn(),
  };
});
vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  meetCallRoomRoute: mocks.route,
  callRoomService: mocks.service,
}));

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const access = { meeting: { id: meetingId, ws_id: 'room-workspace' } };
const url = `https://meet.test/api/meet-call/${meetingId}/classroom-tools`;
const read = () =>
  dispatchMeetEndpoint(new NextRequest(`${url}?action=whiteboard.read`));
const draw = (body = JSON.stringify({ action: 'whiteboard.undo' })) =>
  dispatchMeetEndpoint(new NextRequest(url, { method: 'POST', body }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.maybeSingle.mockResolvedValue({
    data: null,
    error: null,
  });
  mocks.route.mockImplementation(async (_request, _id, _allowGuest, run) => {
    try {
      return Response.json(await run(access));
    } catch (error) {
      return new Response(null, {
        status: (error as { status?: number }).status ?? 400,
      });
    }
  });
  mocks.service.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());

test.each([undefined, 'false', '1', 'TRUE'])(
  'deployment flag %s blocks reads and writes before room access',
  async (value) => {
    vi.stubEnv('MEET_EDUCATION_ENABLED', value);
    expect((await read())?.status).toBe(404);
    expect((await draw())?.status).toBe(404);
    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  }
);

test.each([
  { data: { value: 'false' }, error: null },
  { data: { value: ' FALSE ' }, error: null },
  { data: null, error: new Error('unavailable') },
])(
  'an opt-out or unreadable workspace setting blocks tools',
  async (setting) => {
    vi.stubEnv('MEET_EDUCATION_ENABLED', 'true');
    mocks.query.maybeSingle.mockResolvedValue(setting);
    expect((await read())?.status).toBe(404);
    expect((await draw('invalid JSON'))?.status).toBe(404);
    expect(mocks.query.eq).toHaveBeenCalledWith('ws_id', 'room-workspace');
    expect(mocks.query.eq).toHaveBeenCalledWith('name', 'ENABLE_EDUCATION');
    expect(mocks.service).not.toHaveBeenCalled();
  }
);

test('a thrown settings lookup fails closed', async () => {
  vi.stubEnv('MEET_EDUCATION_ENABLED', 'true');
  mocks.query.maybeSingle.mockRejectedValue(new Error('unavailable'));
  expect((await read())?.status).toBe(404);
  expect((await draw())?.status).toBe(404);
  expect(mocks.service).not.toHaveBeenCalled();
});

test.each([null, { value: 'true' }])(
  'the deployment flag enables room-scoped classroom commands with setting %j',
  async (data) => {
    vi.stubEnv('MEET_EDUCATION_ENABLED', 'true');
    mocks.query.maybeSingle.mockResolvedValue({ data, error: null });
    expect((await read())?.status).toBe(200);
    expect(mocks.route).toHaveBeenCalledWith(
      expect.any(Request),
      meetingId,
      true,
      expect.any(Function)
    );
    expect(mocks.service).toHaveBeenLastCalledWith(
      access,
      { action: 'whiteboard.read' },
      { classroomTools: true }
    );
    expect((await draw())?.status).toBe(200);
    expect(mocks.service).toHaveBeenLastCalledWith(
      access,
      { action: 'whiteboard.undo' },
      { classroomTools: true }
    );
  }
);

test('invalid and oversized writes never reach room storage', async () => {
  vi.stubEnv('MEET_EDUCATION_ENABLED', 'true');
  expect((await draw('{"action":"poll.publish"}'))?.status).toBe(400);
  expect((await draw(' '.repeat(9000)))?.status).toBe(400);
  expect(mocks.service).not.toHaveBeenCalled();
});
