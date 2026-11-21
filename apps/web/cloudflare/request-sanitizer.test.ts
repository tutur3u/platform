import { describe, expect, it } from 'vitest';
import { sanitizeUpstreamResponseHeaders } from './request-sanitizer';

describe('sanitizeUpstreamResponseHeaders', () => {
  it('keeps HttpOnly Supabase session cookies byte-for-byte and drops Vercel state', () => {
    const sessionCookies = [
      'sb-ref-auth-token.0=base64-a; Domain=.tuturuuu.com; Path=/; Max-Age=34560000; Secure; HttpOnly; SameSite=lax',
      'sb-ref-auth-token.1=b; Domain=.tuturuuu.com; Path=/; Max-Age=34560000; Secure; HttpOnly; SameSite=lax',
    ];
    const headers = new Headers({ 'x-vercel-id': 'synthetic' });
    headers.append('set-cookie', '_vercel_jwt=synthetic; Path=/; HttpOnly');
    for (const cookie of sessionCookies) headers.append('set-cookie', cookie);

    const sanitized = sanitizeUpstreamResponseHeaders(headers);

    expect(sanitized.getSetCookie()).toEqual(sessionCookies);
    expect(sanitized.get('x-vercel-id')).toBeNull();
  });
});
