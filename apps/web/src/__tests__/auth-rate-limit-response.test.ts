import { describe, expect, it } from 'vitest';
import {
  buildAuthRateLimitDiagnosticHeaders,
  jsonWithAuthRateLimitDiagnostics,
} from '@/app/api/v1/auth/mobile/shared';

function requestWithIp(ipAddress: string) {
  return new Request('http://localhost/api/v1/auth/otp/send', {
    headers: {
      'cf-connecting-ip': ipAddress,
    },
  });
}

describe('auth rate-limit response diagnostics', () => {
  it('adds customer-debuggable rate-limit headers on 429 auth responses', () => {
    const request = requestWithIp('203.0.113.42');
    const headers = buildAuthRateLimitDiagnosticHeaders({
      body: { error: 'Too many requests', retryAfter: 42 },
      policy: 'otp-send',
      request,
      status: 429,
    });

    expect(headers).toEqual({
      'Retry-After': '42',
      'X-RateLimit-Caller-Class': 'anonymous',
      'X-RateLimit-Client-IP': '203.0.113.42',
      'X-RateLimit-Policy': 'otp-send',
    });
  });

  it('does not emit diagnostic rate-limit headers for non-429 auth responses', () => {
    const request = requestWithIp('203.0.113.42');
    const headers = buildAuthRateLimitDiagnosticHeaders({
      body: { error: 'Invalid request body' },
      policy: 'password-login',
      request,
      status: 400,
    });

    expect(headers).toEqual({});
  });

  it('exposes auth diagnostic headers through CORS', () => {
    const response = jsonWithAuthRateLimitDiagnostics(
      { error: 'Too many requests', retryAfter: '13' },
      {
        policy: 'password-login',
        request: requestWithIp('198.51.100.10'),
        status: 429,
      }
    );

    expect(response.headers.get('Retry-After')).toBe('13');
    expect(response.headers.get('X-RateLimit-Client-IP')).toBe('198.51.100.10');
    expect(response.headers.get('X-RateLimit-Policy')).toBe('password-login');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain(
      'X-RateLimit-Client-IP'
    );
  });
});
