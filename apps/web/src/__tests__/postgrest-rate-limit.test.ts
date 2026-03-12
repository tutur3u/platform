import { describe, expect, it } from 'vitest';
import {
  buildPostgrestRateLimitResponse,
  getPostgrestRateLimitMetadata,
} from '../lib/postgrest-rate-limit';

describe('postgrest rate limit helpers', () => {
  it('extracts retry-after metadata from custom PostgREST rate-limit errors', () => {
    const metadata = getPostgrestRateLimitMetadata({
      code: 'RATE_LIMITED',
      details: JSON.stringify({
        status: 429,
        headers: { 'Retry-After': '17' },
      }),
      message: JSON.stringify({
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded, try again later',
      }),
    });

    expect(metadata).toEqual({ retryAfter: 17 });
  });

  it('builds a 429 response for custom PostgREST rate-limit errors', async () => {
    const response = buildPostgrestRateLimitResponse({
      code: 'RATE_LIMITED',
      details: JSON.stringify({
        status: 429,
        headers: { 'Retry-After': '9' },
      }),
      message: JSON.stringify({
        code: 'RATE_LIMITED',
      }),
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('9');
    await expect(response?.json()).resolves.toEqual({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
    });
  });

  it('ignores non-rate-limit PostgREST errors', () => {
    const response = buildPostgrestRateLimitResponse({
      code: 'PGRST116',
      details: JSON.stringify({ status: 404 }),
      message: 'Not found',
    });

    expect(response).toBeNull();
  });
});
