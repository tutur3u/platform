import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  verify: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-access', () => ({
  resolveMeetGuestJoin: mocks.resolve,
}));
vi.mock('@tuturuuu/meet-core/features/call/lib/guest-rate-limit', () => ({
  checkMeetGuestJoinLimit: mocks.limit,
}));
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
  mocks.limit.mockResolvedValue({ ok: true });
  mocks.resolve.mockResolvedValue({ kind: 'available', meeting: {} });
  mocks.verify.mockResolvedValue(undefined);
});

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
  ).resolves.toMatchObject({ meetingId, displayName: 'Hà My' });
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
