import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  admin: vi.fn(),
  resolve: vi.fn(),
  membership: vi.fn(),
  availability: vi.fn(),
  flag: vi.fn(),
  parley: vi.fn(),
  app: { value: 'meet' },
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/runtime', () => ({
  get MEETING_APP() {
    return mocks.app.value;
  },
}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: mocks.parley,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  resolveWorkspaceIdForPrincipal: mocks.resolve,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('./transcription-availability', () => ({
  readMeetTranscriptionAvailability: mocks.availability,
}));
vi.mock('./per-speaker-flag', () => ({ meetPerSpeakerEnabled: mocks.flag }));
vi.mock('./access', async (original) => ({ ...(await original<object>()) }));
vi.mock('@tuturuuu/ai/meetings/gemini', () => ({}));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));

import { loadSelfSession, meetSelfAccess } from './self-v1-access';

const ws = '00000000-0000-4000-8000-0000000000ee';
const meetingId = '00000000-0000-4000-8000-0000000000dd';
const sessionId = '00000000-0000-4000-8000-0000000000cc';
const host = '00000000-0000-4000-8000-0000000000a1';
const params = { params: Promise.resolve({ wsId: ws, meetingId }) };
const request = (origin = 'https://meet.tuturuuu.com') =>
  new Request('https://meet.tuturuuu.com/api/meet-ai/x/y/chunks', {
    method: 'POST',
    headers: { origin },
  });

function chain(result: unknown) {
  const value: Record<string, unknown> = {};
  for (const key of ['select', 'eq']) value[key] = vi.fn(() => value);
  value.maybeSingle = vi.fn().mockResolvedValue(result);
  return value;
}

const status = async (work: Promise<unknown>) =>
  work.then(
    () => 200,
    (error) => ({ status: error.status, code: error.code })
  );

describe('per-speaker uploader access', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.app.value = 'meet';
    mocks.user.mockResolvedValue({ id: 'uploader' });
    mocks.admin.mockResolvedValue({
      from: () =>
        chain({ data: { id: meetingId, creator_id: host, ws_id: ws } }),
    });
    mocks.resolve.mockResolvedValue(ws);
    mocks.availability.mockResolvedValue({ available: true });
    mocks.flag.mockResolvedValue(true);
    mocks.parley.mockResolvedValue(false);
    mocks.membership.mockResolvedValue({ ok: true });
  });

  it('admits a pilot member who is not the host', async () => {
    expect(await meetSelfAccess(request(), params)).toMatchObject({
      user: { id: 'uploader' },
      wsId: ws,
      isHost: false,
    });
  });

  it.each([
    ['Parley', () => (mocks.app.value = 'parley'), 403],
    ['a cross-origin request', null, 403, 'https://evil.example'],
    ['no Meet session', () => mocks.user.mockResolvedValue(null), 401],
    [
      'kill switch or workspace gate',
      () =>
        mocks.availability.mockResolvedValue({
          available: false,
          reason: 'disabled',
        }),
      403,
    ],
    [
      'flag off or allowlist miss',
      () => mocks.flag.mockResolvedValue(false),
      403,
    ],
    ['a Parley session', () => mocks.parley.mockResolvedValue(true), 403],
  ] as const)('refuses %s', async (_label, arrange, expected, origin?) => {
    arrange?.();
    expect(await status(meetSelfAccess(request(origin), params))).toMatchObject(
      { status: expected }
    );
  });

  it('refuses a signed-in pilot non-member like a guest', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    expect(await status(meetSelfAccess(request(), params))).toMatchObject({
      status: 409,
      code: 'MEET_SELF_NOT_ELIGIBLE',
    });
  });
});

describe('self_v1 session load', () => {
  const future = () => new Date(Date.now() + 60_000).toISOString();
  const past = () => new Date(Date.now() - 1000).toISOString();
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: sessionId,
    meeting_id: meetingId,
    protocol: 'self_v1',
    user_id: host,
    billing_host_id: host,
    billing_ws_id: ws,
    capture_state: 'active',
    capture_deadline_at: future(),
    drain_deadline_at: null,
    ended_at: null,
    ...overrides,
  });
  const load = (session: unknown, phase: 'open' | 'upload' = 'upload') =>
    status(
      loadSelfSession(
        { from: () => chain({ data: session, error: null }) } as never,
        { sessionId, meetingId, wsId: ws },
        phase
      )
    );

  it('accepts an active session', async () => {
    expect(await load(row())).toBe(200);
  });

  it.each([
    ['a room-capture session', { protocol: 'legacy' }],
    ['a null host', { user_id: null }],
    ['a null payer', { billing_host_id: null }],
    ['another payer workspace', { billing_ws_id: host }],
    ['a stopped session', { capture_state: 'closed', ended_at: past() }],
    ['an expired capture deadline', { capture_deadline_at: past() }],
    [
      'a drain past its deadline',
      { capture_state: 'draining', drain_deadline_at: past() },
    ],
  ])('refuses %s', async (_label, overrides) => {
    expect(await load(row(overrides))).toMatchObject({ status: 409 });
  });

  it('accepts drain uploads before the deadline but never opens a stream', async () => {
    const draining = row({
      capture_state: 'draining',
      drain_deadline_at: future(),
    });
    expect(await load(draining, 'upload')).toBe(200);
    expect(await load(draining, 'open')).toMatchObject({ status: 409 });
  });

  it('refuses a missing session', async () => {
    expect(await load(null)).toMatchObject({ status: 404 });
  });
});
