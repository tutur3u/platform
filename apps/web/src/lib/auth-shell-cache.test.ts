import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { applyAuthShellCacheHeaders } from './auth-shell-cache';

function headersFor(cookie?: string, pathname = '/en/login') {
  const request = new NextRequest(`https://tuturuuu.com${pathname}`, {
    headers: cookie ? { cookie } : {},
  });
  return applyAuthShellCacheHeaders(request, NextResponse.next()).headers;
}

describe('applyAuthShellCacheHeaders', () => {
  it.each(['/en/login', '/vi/login', '/vi/add-account'])(
    'shares the anonymous locale-prefixed %s shell through the CDN',
    (pathname) => {
      const headers = headersFor('NEXT_LOCALE=en', pathname);

      expect(headers.get('CDN-Cache-Control')).toContain('public');
      expect(headers.get('Vercel-CDN-Cache-Control')).toContain('public');
    }
  );

  it.each(['/login', '/add-account'])(
    'keeps unprefixed negotiated %s private and unstored even without a session cookie',
    (pathname) => {
      const headers = headersFor('NEXT_LOCALE=fr', pathname);

      expect(headers.get('Cache-Control')).toBe('private, no-store');
      expect(headers.get('CDN-Cache-Control')).toBe('no-store');
      expect(headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
      expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    }
  );

  it.each([
    'sb-project-auth-token=x',
    'sb-project-auth-token.0=x',
    'tuturuuu_web_app_session=x',
    'tuturuuu_web_app_session_refresh=x',
  ])('never stores a shell rendered for a session cookie (%s)', (cookie) => {
    const headers = headersFor(cookie);

    expect(headers.get('Cache-Control')).toBe('private, no-store');
    expect(headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
    expect(headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
