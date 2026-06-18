import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sonner toast before importing the module
const mockWarning = vi.fn();
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { warning: mockWarning },
}));

// We need to reset module state between tests since the interceptor uses
// module-scoped `installed` and `rateLimitToastActive` flags
let installFetchInterceptor: () => void;
let setRateLimitDetailsHandler: (
  handler: ((details: unknown) => void) | null
) => void;
let setRateLimitMessage: (fn: (seconds: number) => string) => void;

describe('fetch-interceptor', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    // Save the real fetch
    originalFetch = globalThis.fetch;

    // Reset module registry to get fresh module state
    vi.resetModules();

    // Re-import after reset
    const mod = await import('../lib/fetch-interceptor');
    installFetchInterceptor = mod.installFetchInterceptor;
    setRateLimitDetailsHandler = mod.setRateLimitDetailsHandler;
    setRateLimitMessage = mod.setRateLimitMessage;

    mockWarning.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore the original fetch
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('should install without errors', () => {
    expect(() => installFetchInterceptor()).not.toThrow();
  });

  it('should pass through non-429 responses unchanged', async () => {
    const mockResponse = new Response(JSON.stringify({ data: 'ok' }), {
      status: 200,
    });
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const response = await globalThis.fetch('/api/test');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('should retry on 429 and return successful response', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '1' },
    });
    const ok200 = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/data');

    // Advance past the retry delay (1 second)
    await vi.advanceTimersByTimeAsync(1000);

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should show a toast on 429', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '3' },
    });
    const ok200 = new Response('', { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/data');

    await vi.advanceTimersByTimeAsync(3000);
    await fetchPromise;

    expect(mockWarning).toHaveBeenCalledTimes(1);
    // The default English message
    expect(mockWarning.mock.calls[0]?.[0]).toContain('rate limited');
    expect(mockWarning.mock.calls[0]?.[0]).toContain('3s');
    expect(mockWarning.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        action: expect.objectContaining({ label: 'View details' }),
      })
    );
  });

  it('should open rate-limit details from the toast action', async () => {
    const detailsHandler = vi.fn();
    const rate429 = new Response('', {
      status: 429,
      headers: {
        'Retry-After': '3',
        'X-RateLimit-Caller-Class': 'authenticated',
        'X-RateLimit-Policy': 'users-me',
        'X-RateLimit-Window': 'minute',
        'X-Request-Id': 'req-123',
      },
    });
    const ok200 = new Response('', { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    setRateLimitDetailsHandler(detailsHandler);
    installFetchInterceptor();
    const fetchPromise = globalThis.fetch(
      '/api/v1/users/me/profile?token=secret&tab=settings'
    );

    await vi.advanceTimersByTimeAsync(3000);
    await fetchPromise;

    const toastOptions = mockWarning.mock.calls[0]?.[1] as {
      action?: { onClick?: () => void };
    };
    toastOptions.action?.onClick?.();

    expect(detailsHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-RateLimit-Caller-Class': 'authenticated',
          'X-RateLimit-Policy': 'users-me',
          'X-RateLimit-Window': 'minute',
          'X-Request-Id': 'req-123',
        }),
        method: 'GET',
        requestPath: '/api/v1/users/me/profile?token=[redacted]&tab=settings',
        retryAfterSeconds: 3,
        status: 429,
        willRetry: true,
      })
    );
    expect(JSON.stringify(detailsHandler.mock.calls[0]?.[0])).not.toContain(
      'secret'
    );
  });

  it('should stop after MAX_RETRIES (3) and return the 429 response', async () => {
    const make429 = () =>
      new Response('', {
        status: 429,
        headers: { 'Retry-After': '1' },
      });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(make429())
      .mockResolvedValueOnce(make429())
      .mockResolvedValueOnce(make429())
      .mockResolvedValueOnce(make429());
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/data');

    // Advance through all 3 retries (1s each)
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    const response = await fetchPromise;
    // 1 initial + 3 retries = 4 calls
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(response.status).toBe(429);
  });

  it('should cap Retry-After at 60 seconds', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '999' },
    });
    const ok200 = new Response('', { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/data');

    // Should cap at 60s, not wait 999s
    await vi.advanceTimersByTimeAsync(60000);
    await fetchPromise;

    expect(mockWarning).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should default to 5s when Retry-After header is missing', async () => {
    const rate429 = new Response('', { status: 429 });
    const ok200 = new Response('', { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/data');

    // Default 5s delay
    await vi.advanceTimersByTimeAsync(5000);
    await fetchPromise;

    expect(mockWarning.mock.calls[0]?.[0]).toContain('5s');
  });

  it('should use custom message from setRateLimitMessage', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '2' },
    });
    const ok200 = new Response('', { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    setRateLimitMessage(
      (seconds) => `Giới hạn tần suất. Thử lại sau ${seconds} giây.`
    );
    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/data');

    await vi.advanceTimersByTimeAsync(2000);
    await fetchPromise;

    expect(mockWarning.mock.calls[0]?.[0]).toBe(
      'Giới hạn tần suất. Thử lại sau 2 giây.'
    );
  });

  it('should only install once even when called multiple times', () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const firstFetch = globalThis.fetch;
    installFetchInterceptor();
    const secondFetch = globalThis.fetch;

    // Should be the same wrapped function, not double-wrapped
    expect(firstFetch).toBe(secondFetch);
  });

  it('should NOT retry cross-origin 429 responses', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '1' },
    });
    const mockFetch = vi.fn().mockResolvedValueOnce(rate429);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const response = await globalThis.fetch(
      'https://external-cdn.example.com/image.png'
    );

    // Should return 429 immediately without retrying
    expect(response.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('should show a toast but NOT retry non-idempotent same-origin 429 responses', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '1' },
    });
    const mockFetch = vi.fn().mockResolvedValueOnce(rate429);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const response = await globalThis.fetch('/api/v1/auth/password-login', {
      method: 'POST',
    });

    expect(response.status).toBe(429);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockWarning).toHaveBeenCalledTimes(1);
  });

  it('should retry same-origin relative URL requests', async () => {
    const rate429 = new Response('', {
      status: 429,
      headers: { 'Retry-After': '1' },
    });
    const ok200 = new Response('', { status: 200 });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rate429)
      .mockResolvedValueOnce(ok200);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const fetchPromise = globalThis.fetch('/api/v1/users/me/tasks');

    await vi.advanceTimersByTimeAsync(1000);
    const response = await fetchPromise;

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should pass through non-429 errors without retrying', async () => {
    const error403 = new Response('', { status: 403 });
    const mockFetch = vi.fn().mockResolvedValueOnce(error403);
    globalThis.fetch = mockFetch;

    installFetchInterceptor();
    const response = await globalThis.fetch('/api/data');

    expect(response.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockWarning).not.toHaveBeenCalled();
  });
});
