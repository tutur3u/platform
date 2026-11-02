// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const WS_ID = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING_ID = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const HOST_ID = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const MEMBER_ID = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';

const originalFetch = globalThis.fetch;
const verifyMembership = vi.fn();
const rpc = vi.fn();
const adminClient = vi.fn();
const meetingQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
meetingQuery.select.mockReturnValue(meetingQuery);
meetingQuery.eq.mockReturnValue(meetingQuery);

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
  connection: async () => undefined,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    supabase: { from: () => meetingQuery, rpc },
    user: { id: MEMBER_ID },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: verifyMembership,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => adminClient(),
}));

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: false, error: null });
  adminClient.mockReset().mockImplementation(() => {
    throw new Error('Private notes must not be read');
  });
  verifyMembership.mockResolvedValue({ ok: true });
  process.env.MEET_REALTIME_TOKEN_SECRET = 'test-meet-review-secret';
  meetingQuery.maybeSingle.mockResolvedValue({
    data: { creator_id: HOST_ID, id: MEETING_ID },
    error: null,
  });
  globalThis.fetch = originalFetch;
});

it.each([
  { error: 'membership_missing', status: 403 },
  { error: 'membership_type_mismatch', status: 403 },
  { error: 'membership_lookup_failed', status: 500 },
])('returns $status for $error', async ({ error, status }) => {
  verifyMembership.mockResolvedValue({ ok: false, error });

  const response = await readReview();

  expect(response.status).toBe(status);
  expect(globalThis.fetch).toBe(originalFetch);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function readReview() {
  const { GET } = await import('./route');
  return GET(
    new Request(
      `http://localhost/api/v1/workspaces/${WS_ID}/meetings/${MEETING_ID}/review`
    ),
    { params: Promise.resolve({ meetingId: MEETING_ID, wsId: WS_ID }) }
  );
}

it.each([
  { ended: true, canReadNotes: false },
  { ended: false, canReadNotes: true },
])(
  'does not read notes when the room policy is $ended/$canReadNotes',
  async (room) => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(Response.json(room)) as typeof fetch;

    const response = await readReview();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ ...room, canManage: false });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  }
);

const EMPTY_NOTES = Promise.resolve({ data: [], error: null });
function notesClient() {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: () => EMPTY_NOTES,
  };
  return { from: () => query };
}

it('lets a workspace admin read ended notes without being a participant', async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  adminClient.mockImplementation(notesClient);
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ended: true, canReadNotes: false })
    ) as typeof fetch;

  const response = await readReview();

  expect(rpc).toHaveBeenCalledWith('has_workspace_permission', {
    p_ws_id: WS_ID,
    p_user_id: MEMBER_ID,
    p_permission: 'admin',
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    ended: true,
    canReadNotes: true,
    canManage: false,
    costs: null,
  });
});

it('lets a participant read ended notes without admin rights', async () => {
  adminClient.mockImplementation(notesClient);
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ended: true, canReadNotes: true })
    ) as typeof fetch;

  const response = await readReview();

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ canReadNotes: true });
});

it('denies a non-participant, non-admin member even when sharing is on', async () => {
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ended: true, canReadNotes: false })
    ) as typeof fetch;

  const response = await readReview();

  expect(await response.json()).toEqual({
    ended: true,
    canReadNotes: false,
    canManage: false,
  });
  expect(adminClient).not.toHaveBeenCalled();
});

it('fails closed when the admin lookup is unavailable', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ ended: true, canReadNotes: false })
    ) as typeof fetch;

  const response = await readReview();

  expect(response.status).toBe(503);
  expect(adminClient).not.toHaveBeenCalled();
});
