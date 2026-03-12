import { type NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockCreateClient = vi.fn(() => ({
  auth: { getUser: mockGetUser },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: () => mockCreateClient(),
}));

const mockExtractIP = vi.fn().mockReturnValue('192.168.1.1');
const mockIsIPBlocked = vi.fn().mockResolvedValue(null);
const mockRecordAuthFailure = vi.fn();

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: (h: unknown) => mockExtractIP(h),
  isIPBlocked: (ip: unknown) => mockIsIPBlocked(ip),
  recordApiAuthFailure: (ip: unknown, endpoint: unknown) =>
    mockRecordAuthFailure(ip, endpoint),
}));

const mockCheckRateLimit = vi
  .fn()
  .mockResolvedValue({ allowed: true, headers: {} });

vi.mock('../lib/rate-limit', () => ({
  checkRateLimit: (key: unknown, config: unknown) =>
    mockCheckRateLimit(key, config),
}));

const mockCheckSuspension = vi.fn().mockResolvedValue({ suspended: false });

vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: (userId: unknown) => mockCheckSuspension(userId),
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------
import { withSessionAuth } from '../lib/api-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url = 'http://localhost:3000/api/test'
): NextRequest {
  return new Request(url, { method }) as unknown as NextRequest;
}

const fakeUser = { id: 'user-123', email: 'test@test.com' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withSessionAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockIsIPBlocked.mockResolvedValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, headers: {} });
    mockCheckSuspension.mockResolvedValue({ suspended: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- Happy path ----

  it('should call handler with user and supabase on success', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({ ok: true }));

    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        user: fakeUser,
      })
    );
    expect(response.status).toBe(200);
  });

  // ---- IP block ----

  it('should return 429 when IP is blocked', async () => {
    mockIsIPBlocked.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60000),
      reason: 'abuse',
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error).toBe('Too Many Requests');

    // Should have Retry-After header
    expect(response.headers.get('Retry-After')).toBeTruthy();
  });

  // ---- Rate limiting ----

  it('should return rate limit response when rate limit is exceeded', async () => {
    const rateLimitResponse = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': '10' } }
    );
    mockCheckRateLimit.mockResolvedValue(rateLimitResponse);

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('POST'));

    expect(response.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    // Auth should never have been called
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('should skip default read rate limiting for GET requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('GET'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('should skip default read rate limiting for HEAD requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('HEAD'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('should use mutate key for POST requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('POST'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.objectContaining({ maxRequests: 20 })
    );
  });

  it('should use mutate key for PUT requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('PUT'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.any(Object)
    );
  });

  it('should use mutate key for DELETE requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('DELETE'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.any(Object)
    );
  });

  it('should use mutate key for PATCH requests', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('PATCH'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringContaining('mutate'),
      expect.any(Object)
    );
  });

  it('should use custom rate limit when provided', async () => {
    const customConfig = { windowMs: 10000, maxRequests: 5 };
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, { rateLimit: customConfig });

    await wrapped(makeRequest('POST'));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      customConfig
    );
  });

  it('should skip rate limiting when rateLimit is false', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, { rateLimit: false });

    await wrapped(makeRequest('GET'));

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  // ---- Authentication ----

  it('should return 401 when auth fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should record auth failure on 401', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid'),
    });

    const wrapped = withSessionAuth(vi.fn());
    await wrapped(makeRequest('GET'));

    expect(mockRecordAuthFailure).toHaveBeenCalledWith(
      '192.168.1.1',
      '/api/test'
    );
  });

  // ---- Suspension ----

  it('should return 403 when user is suspended', async () => {
    mockCheckSuspension.mockResolvedValue({
      suspended: true,
      reason: 'Spam activity',
    });

    const handler = vi.fn();
    const wrapped = withSessionAuth(handler);
    const response = await wrapped(makeRequest('GET'));

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.message).toBe('Spam activity');
  });

  // ---- Cache-Control ----

  it('should set Cache-Control on successful GET with cache option', async () => {
    const handler = vi
      .fn()
      .mockReturnValue(NextResponse.json({ data: 'test' }));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 60, swr: 30 },
    });

    const response = await wrapped(makeRequest('GET'));
    const cc = response.headers.get('Cache-Control');

    expect(cc).toBe('private, max-age=60, stale-while-revalidate=30');
  });

  it('should NOT set Cache-Control on POST even with cache option', async () => {
    const handler = vi
      .fn()
      .mockReturnValue(NextResponse.json({ data: 'created' }));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 60, swr: 30 },
    });

    const response = await wrapped(makeRequest('POST'));
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  it('should NOT set Cache-Control on error responses', async () => {
    const handler = vi
      .fn()
      .mockReturnValue(NextResponse.json({ error: 'bad' }, { status: 400 }));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 60 },
    });

    const response = await wrapped(makeRequest('GET'));
    expect(response.headers.get('Cache-Control')).toBeNull();
  });

  it('should set Cache-Control without swr when not provided', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler, {
      cache: { maxAge: 120 },
    });

    const response = await wrapped(makeRequest('GET'));
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=120');
  });

  // ---- Unknown IP handling ----

  it('should skip rate limiting and IP block for unknown IPs', async () => {
    mockExtractIP.mockReturnValue('unknown');

    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    await wrapped(makeRequest('GET'));

    expect(mockIsIPBlocked).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  // ---- Route params ----

  it('should resolve and pass route params to handler', async () => {
    const handler = vi.fn().mockReturnValue(NextResponse.json({}));
    const wrapped = withSessionAuth(handler);
    const params = { wsId: 'workspace-1', boardId: 'board-2' };

    await wrapped(makeRequest('GET'), {
      params: Promise.resolve(params),
    });

    expect(handler.mock.calls[0]?.[2]).toEqual(params);
  });
});
