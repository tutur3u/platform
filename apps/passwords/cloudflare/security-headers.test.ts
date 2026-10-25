import { describe, expect, it } from 'vitest';
import { withSecurityHeaders } from './security-headers';

describe('withSecurityHeaders', () => {
  it('forces no-store and framing denial over an upstream cache policy', () => {
    const result = withSecurityHeaders(
      new Response('{}', { headers: { 'Cache-Control': 'public, max-age=60' } })
    );
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(result.headers.get('X-Frame-Options')).toBe('DENY');
    expect(result.headers.get('Content-Security-Policy')).toContain(
      "frame-ancestors 'none'"
    );
  });

  it('preserves status, body and Set-Cookie headers', async () => {
    const upstream = new Response('body', { status: 403 });
    upstream.headers.append('Set-Cookie', 'a=1');
    upstream.headers.append('Set-Cookie', 'b=2');
    const result = withSecurityHeaders(upstream);
    expect(result.status).toBe(403);
    expect(await result.text()).toBe('body');
    expect(result.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
  });
});
