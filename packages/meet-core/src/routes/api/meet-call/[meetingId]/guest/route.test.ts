import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  cookie: vi.fn(),
  verify: vi.fn(),
  limit: vi.fn(),
  unverifiedLimit: vi.fn(),
  risk: vi.fn(),
  redeem: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-access', () => ({
  resolveMeetGuestJoin: mocks.resolve,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-rate-limit', () => ({
  checkMeetGuestJoinLimit: mocks.limit,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-unverified-limit', () => ({
  checkMeetGuestUnverifiedLimit: mocks.unverifiedLimit,
}));
vi.mock(
  '@tuturuuu/meet-core/features/call/server/guest-unverified-risk',
  () => ({ assessMeetGuestUnverifiedJoin: mocks.risk })
);
vi.mock('@tuturuuu/meet-core/features/call/server/guest-human-check', () => ({
  meetHumanCheckGuard: async () => null,
  meetHumanCheckScope: (id: string) => `meet:${id}`,
  meetHumanCheckSecret: () => 'secret-0123456789abcdef0123456789abcdef',
  meetHumanCheckStore: () => ({ incr: async () => 1 }),
}));
vi.mock('@tuturuuu/human-check', () => ({ redeemPassToken: mocks.redeem }));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/usage-limit', () => ({
  meetAiUsageGuard: vi.fn(async () => ({ selection: { kind: 'off' } })),
}));
vi.mock('@tuturuuu/cloudflare/turnstile/server', () => ({
  extractTurnstileRemoteIp: () => '203.0.113.4',
  verifyTurnstileToken: mocks.verify,
}));

import { verifyMeetGuestSession } from '@tuturuuu/meet-core/features/call/lib/guest-session';
import { DELETE, POST } from './route';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const url = `https://meet.test/api/meet-call/${meetingId}/guest`;

function request(body: unknown, origin = 'https://meet.test') {
  return new Request(url, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ meetingId }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie.mockReturnValue(undefined);
  mocks.limit.mockResolvedValue({ ok: true });
  mocks.resolve.mockResolvedValue({ kind: 'available', meeting: {} });
  mocks.verify.mockResolvedValue(undefined);
  mocks.unverifiedLimit.mockResolvedValue({ ok: true });
  mocks.risk.mockResolvedValue({
    allowed: true,
    networkLimit: 3,
    decision: null,
  });
});

async function cookieSession(response: Response) {
  const header = response.headers.get('Set-Cookie') ?? '';
  const value = header.split(';')[0]?.split('=').slice(1).join('=');
  return verifyMeetGuestSession(
    value,
    meetingId,
    'meet-local-development-token-secret'
  );
}

it('refuses cross-origin requests before any check', async () => {
  const response = await POST(
    request({ displayName: 'An' }, 'https://evil.test'),
    params
  );
  expect(response.status).toBe(403);
  expect(mocks.limit).not.toHaveBeenCalled();
});

it('requires a display name', async () => {
  const response = await POST(request({ displayName: '  ' }), params);
  expect(response.status).toBe(400);
  expect(mocks.limit).not.toHaveBeenCalled();
});

it('counts the attempt before checking gates and Turnstile', async () => {
  mocks.limit.mockResolvedValue({ ok: false, retryAfterSeconds: 42 });
  const response = await POST(
    request({ displayName: 'An', turnstileToken: 't' }),
    params
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('42');
  expect(mocks.resolve).not.toHaveBeenCalled();
  expect(mocks.verify).not.toHaveBeenCalled();
});

it('stays closed when guest join is unavailable', async () => {
  mocks.resolve.mockResolvedValue({ kind: 'unavailable' });
  const response = await POST(
    request({ displayName: 'An', turnstileToken: 't' }),
    params
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('MEET_GUEST_UNAVAILABLE');
  expect(mocks.verify).not.toHaveBeenCalled();
});

it('refuses a failed Turnstile check without a cookie', async () => {
  mocks.verify.mockRejectedValue(new Error('failed'));
  const response = await POST(
    request({ displayName: 'An', turnstileToken: 't' }),
    params
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('MEET_GUEST_TURNSTILE_FAILED');
  expect(response.headers.get('Set-Cookie')).toBeNull();
  expect(mocks.verify).toHaveBeenCalledWith(expect.any(Request), 't', {
    devMode: false,
    expectedHostname: 'meet.test',
  });
});

it('sets a signed guest cookie bound to this meeting', async () => {
  const response = await POST(
    request({ displayName: '  Hà   My ', turnstileToken: 't' }),
    params
  );
  expect(response.status).toBe(200);
  const header = response.headers.get('Set-Cookie') ?? '';
  expect(header).toContain('HttpOnly');
  const value = header.split(';')[0]?.split('=').slice(1).join('=');
  await expect(
    verifyMeetGuestSession(
      value,
      meetingId,
      'meet-local-development-token-secret'
    )
  ).resolves.toMatchObject({
    meetingId,
    displayName: 'Hà My',
    turnstileVerified: true,
  });
});

it('clears the guest cookie on DELETE', async () => {
  const response = await DELETE(
    new Request(url, {
      method: 'DELETE',
      headers: { origin: 'https://meet.test' },
    })
  );
  expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
});

it('binds the same verified challenge to one identity and keeps the existing verified cookie', async () => {
  const join = (turnstileToken: string) =>
    POST(request({ displayName: 'An', turnstileToken }), params);
  const first = (await join('verified-token')).headers
    .get('Set-Cookie')
    ?.split(';')[0];
  const second = (await join('verified-token')).headers
    .get('Set-Cookie')
    ?.split(';')[0];
  const value = first?.slice(first.indexOf('=') + 1);
  expect(value).toBeTruthy();
  const other = second?.slice(second.indexOf('=') + 1);
  const secret = 'meet-local-development-token-secret';
  const session = await verifyMeetGuestSession(value, meetingId, secret);
  expect(session).toMatchObject({ turnstileVerified: true });
  await expect(
    verifyMeetGuestSession(other, meetingId, secret)
  ).resolves.toMatchObject({
    guestId: session?.guestId,
  });
  mocks.cookie.mockReturnValue({ value });
  const repeated = await join('new-token');
  expect(repeated.status).toBe(200);
  expect(repeated.headers.get('Set-Cookie')).toBeNull();
  expect(mocks.verify).toHaveBeenCalledTimes(2);
});

it('still requires Turnstile when a tokenless request does not ask the host', async () => {
  mocks.verify.mockRejectedValue(new Error('missing'));
  const response = await POST(request({ displayName: 'An' }), params);
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('MEET_GUEST_TURNSTILE_FAILED');
  expect(mocks.risk).not.toHaveBeenCalled();
});

it('lets a tokenless host-approval request into the lobby unverified', async () => {
  const response = await POST(
    request({ displayName: 'Safari guest', hostApproval: true }),
    params
  );
  expect(response.status).toBe(200);
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.limit).toHaveBeenCalled();
  expect(mocks.risk).toHaveBeenCalledWith(expect.any(Request), {
    meetingId,
    network: '203.0.113.4',
  });
  expect(mocks.unverifiedLimit).toHaveBeenCalledWith(
    { meetingId, network: '203.0.113.4', networkLimit: 3 },
    null
  );
  const session = await cookieSession(response);
  expect(session).toMatchObject({ meetingId, displayName: 'Safari guest' });
  expect(session?.turnstileVerified).toBeUndefined();
});

it('refuses a tokenless request the abuse policy flags', async () => {
  mocks.risk.mockResolvedValue({ allowed: false, decision: {} });
  const response = await POST(
    request({ displayName: 'An', hostApproval: true }),
    params
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('MEET_GUEST_VERIFICATION_REQUIRED');
  expect(response.headers.get('Set-Cookie')).toBeNull();
  expect(mocks.unverifiedLimit).not.toHaveBeenCalled();
});

it('rate-limits tokenless requests separately', async () => {
  mocks.unverifiedLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 60 });
  const response = await POST(
    request({ displayName: 'An', hostApproval: true }),
    params
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(response.headers.get('Set-Cookie')).toBeNull();
});

it('keeps the ordinary join limit and gates ahead of the tokenless path', async () => {
  mocks.resolve.mockResolvedValue({ kind: 'unavailable' });
  const response = await POST(
    request({ displayName: 'An', hostApproval: true }),
    params
  );
  expect(response.status).toBe(403);
  expect(mocks.risk).not.toHaveBeenCalled();
});

it('verifies a token even when hostApproval is also sent', async () => {
  mocks.verify.mockRejectedValue(new Error('bad'));
  const response = await POST(
    request({ displayName: 'An', turnstileToken: 't', hostApproval: true }),
    params
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('MEET_GUEST_TURNSTILE_FAILED');
  expect(mocks.risk).not.toHaveBeenCalled();
});

it('admits a redeemed puzzle pass as a verified guest', async () => {
  mocks.redeem.mockResolvedValue({ ok: true, jti: 'jti-1', challengeId: 'c' });
  const response = await POST(
    request({ displayName: 'Puzzle guest', humanPassToken: 'pass' }),
    params
  );
  expect(response.status).toBe(200);
  expect(mocks.verify).not.toHaveBeenCalled();
  expect(mocks.redeem).toHaveBeenCalledWith(
    expect.objectContaining({
      token: 'pass',
      scope: `meet:${meetingId}`,
      subject: '203.0.113.4',
    })
  );
  expect((await cookieSession(response))?.turnstileVerified).toBe(true);
});

it('refuses a spent or foreign puzzle pass', async () => {
  mocks.redeem.mockResolvedValue({ ok: false });
  const response = await POST(
    request({ displayName: 'An', humanPassToken: 'pass', hostApproval: true }),
    params
  );
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('MEET_GUEST_TURNSTILE_FAILED');
  expect(response.headers.get('Set-Cookie')).toBeNull();
  expect(mocks.risk).not.toHaveBeenCalled();
});
