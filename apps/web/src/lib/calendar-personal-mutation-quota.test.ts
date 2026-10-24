// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decision: vi.fn(),
  adaptive: vi.fn(),
  limit: vi.fn(),
  signal: vi.fn(),
}));
vi.mock('./abuse-risk', () => ({
  resolveWebAbuseDecision: mocks.decision,
  getAdaptiveRateLimitConfig: mocks.adaptive,
  recordResponseAbuseSignal: mocks.signal,
}));
vi.mock('./rate-limit', () => ({ checkRateLimit: mocks.limit }));

import { calendarPersonalSessionControls } from './calendar-personal-mutation-quota';

const user = { id: 'actor', created_at: '2025-01-01T00:00:00Z' };
const request = () =>
  new NextRequest('https://tuturuuu.com/api/v1/users/calendar-settings', {
    method: 'PATCH',
  });
describe('personal Calendar actor quota parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.decision.mockResolvedValue({ tier: 'normal', trustMultiplier: 0.5 });
    mocks.adaptive.mockReturnValue({
      config: { windowMs: 60_000, maxRequests: 60, maxRequestsMultiplier: 0.5 },
    });
  });
  it('uses the shared session actor bucket and adaptive configuration without an IP bucket', async () => {
    mocks.limit.mockResolvedValue({
      allowed: true,
      headers: { 'X-RateLimit-Limit': '30', 'X-RateLimit-Remaining': '29' },
    });
    const result = await calendarPersonalSessionControls(request(), user);
    expect(result.response).toBeNull();
    expect(result.headers).toEqual({
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': '29',
    });
    expect(mocks.adaptive).toHaveBeenCalledWith(
      { windowMs: 60_000, maxRequests: 60 },
      { tier: 'normal', trustMultiplier: 0.5 }
    );
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(
      'session:user:mutate:actor',
      { windowMs: 60_000, maxRequests: 60, maxRequestsMultiplier: 0.5 }
    );
  });
  it('records GET success without charging a read quota', async () => {
    const result = await calendarPersonalSessionControls(
      new NextRequest('https://tuturuuu.com/api/v1/users/calendar-settings'),
      user
    );
    const success = NextResponse.json({ timezone: 'auto' });
    expect(result.finalize(success)).toBe(success);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.adaptive).not.toHaveBeenCalled();
    expect(mocks.decision).toHaveBeenCalledWith(
      expect.objectContaining({ isRead: true })
    );
    expect(mocks.signal).toHaveBeenCalledWith(
      expect.objectContaining({ response: success, userId: 'actor' })
    );
  });
  it.each([200, 400, 500])(
    'records the actual PATCH status %s and merges quota headers',
    async (status) => {
      mocks.limit.mockResolvedValue({
        allowed: true,
        headers: { 'X-RateLimit-Limit': '30' },
      });
      const result = await calendarPersonalSessionControls(request(), user);
      const response = NextResponse.json({}, { status });
      expect(result.finalize(response)).toBe(response);
      expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
      expect(mocks.signal).toHaveBeenCalledWith(
        expect.objectContaining({ response, userId: 'actor' })
      );
    }
  );
  it('preserves limit and retry metadata and adds safe native diagnostics on adaptive denial', async () => {
    const denial = NextResponse.json(
      {},
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '30',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': '123',
        },
      }
    );
    mocks.limit.mockResolvedValue(denial);
    const result = await calendarPersonalSessionControls(request(), user);
    expect(result.response).toBe(denial);
    expect(denial.status).toBe(429);
    expect(Object.fromEntries(denial.headers)).toMatchObject({
      'retry-after': '60',
      'x-ratelimit-limit': '30',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '123',
      'x-ratelimit-policy': 'web-calendar-session-user-mutate',
      'x-ratelimit-caller-class': 'authenticated',
      'x-ratelimit-window': 'minute',
    });
    result.finalize(denial);
    expect(mocks.signal).toHaveBeenCalledWith(
      expect.objectContaining({ response: denial, userId: 'actor' })
    );
  });
});
