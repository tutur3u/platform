import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  risk: vi.fn(),
  charge: vi.fn(),
  record: vi.fn(),
  secret: vi.fn(),
  place: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-access', () => ({
  resolveMeetGuestJoin: mocks.resolve,
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/server/guest-unverified-risk',
  () => ({
    assessMeetGuestUnverifiedJoin: mocks.risk,
    MEET_GUEST_HUMAN_CHECK_ROUTE: '/api/meet-call/guest/human-check',
  })
);
vi.mock(
  '@tuturuuu/meet-core/features/call/server/guest-human-check',
  async () => {
    const { createMemoryStore } = await import('@tuturuuu/human-check');
    const store = createMemoryStore();
    return {
      chargeMeetHumanCheck: mocks.charge,
      chargeMeetHumanCheckPlacement: mocks.place,
      meetHumanCheckGuard: async () => null,
      meetHumanCheckScope: (id: string) => `meet:${id}`,
      meetHumanCheckSecret: mocks.secret,
      meetHumanCheckStore: () => store,
    };
  }
);
vi.mock('@tuturuuu/utils/abuse-protection/reputation', () => ({
  buildAbuseRiskSubjects: () => [
    { subject_key: 'ip:203.0.113.4', subject_type: 'ip' },
  ],
  recordAbuseActivitySignal: mocks.record,
}));
vi.mock('@tuturuuu/cloudflare/turnstile/server', () => ({
  extractTurnstileRemoteIp: () => '203.0.113.4',
}));

import { POST as issue } from './route';
import { POST as verify } from './verify/route';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const base = `https://meet.test/api/meet-call/${meetingId}/guest/human-check`;
const params = { params: Promise.resolve({ meetingId }) };
const secret = 'route-test-secret-0123456789abcdef0123456789';
const post = (url: string, body: unknown, origin = 'https://meet.test') =>
  new Request(url, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.secret.mockReturnValue(secret);
  mocks.resolve.mockResolvedValue({ kind: 'available', meeting: {} });
  mocks.risk.mockResolvedValue({
    allowed: true,
    networkLimit: 3,
    decision: null,
  });
  mocks.charge.mockResolvedValue({ ok: true, level: 0 });
  mocks.record.mockResolvedValue(undefined);
  mocks.place.mockResolvedValue({ ok: true });
});

it('issues a puzzle with images and an opaque token only', async () => {
  const response = await issue(post(base, {}), params);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(
    [
      'background',
      'expiresAt',
      'height',
      'piece',
      'pieceSize',
      'pieceY',
      'token',
      'width',
    ].sort()
  );
  expect(mocks.risk).toHaveBeenCalledWith(expect.any(Request), {
    meetingId,
    network: '203.0.113.4',
    kind: 'human-check',
  });
});

it('charges the puzzle budget before any database lookup and cools down', async () => {
  mocks.charge.mockResolvedValue({ ok: false, retryAfterSeconds: 90 });
  const response = await issue(post(base, {}), params);
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('90');
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.risk).not.toHaveBeenCalled();
});

it.each([
  [
    'cross-origin',
    () => issue(post(base, {}, 'https://evil.test'), params),
    403,
  ],
  [
    'unconfigured',
    () => (mocks.secret.mockReturnValue(null), issue(post(base, {}), params)),
    503,
  ],
  [
    'closed guest join',
    () => (
      mocks.resolve.mockResolvedValue({ kind: 'unavailable' }),
      issue(post(base, {}), params)
    ),
    403,
  ],
  [
    'flagged subject',
    () => (
      mocks.risk.mockResolvedValue({ allowed: false, decision: {} }),
      issue(post(base, {}), params)
    ),
    403,
  ],
])('refuses a %s request', async (_, run, status) => {
  expect((await run()).status).toBe(status);
});

it('verifies a placement, records the result and rejects bad input', async () => {
  const challenge = await (await issue(post(base, {}), params)).json();
  const miss = await verify(
    post(`${base}/verify`, {
      token: challenge.token,
      x: 0,
      mode: 'keyboard',
      trajectory: [],
    }),
    params
  );
  expect(await miss.json()).toEqual({ ok: false, retry: true });
  expect(mocks.record).toHaveBeenCalledWith(
    expect.objectContaining({
      signalType: 'challenge_failed',
      reasonCode: 'meet_guest_human_check_failed',
    })
  );
  const bad = await verify(
    post(`${base}/verify`, { token: 'x', x: 'far' }),
    params
  );
  expect(bad.status).toBe(400);
});

it('charges the placement budget before verifying', async () => {
  mocks.place.mockResolvedValue({ ok: false, retryAfterSeconds: 120 });
  const response = await verify(
    post(`${base}/verify`, {
      token: 'x',
      x: 10,
      mode: 'pointer',
      trajectory: [],
    }),
    params
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('120');
  expect(mocks.record).not.toHaveBeenCalled();
});

it('does not record forged tokens', async () => {
  const response = await verify(
    post(`${base}/verify`, {
      token: 'forged',
      x: 10,
      mode: 'pointer',
      trajectory: [],
    }),
    params
  );
  expect(await response.json()).toEqual({ ok: false, retry: false });
  expect(mocks.record).not.toHaveBeenCalled();
});
