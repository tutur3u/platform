import { NextRequest, NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import { applyAuthShellCacheHeaders } from './auth-shell-cache';

function headersFor(cookie?: string) {
  const request = new NextRequest('https://tuturuuu.com/en/login', {
    headers: cookie ? { cookie } : {},
  });
  return applyAuthShellCacheHeaders(request, NextResponse.next()).headers;
}

describe('applyAuthShellCacheHeaders', () => {
  it('shares the anonymous shell through the CDN', () => {
    const headers = headersFor('NEXT_LOCALE=en');

    expect(headers.get('CDN-Cache-Control')).toContain('public');
    expect(headers.get('Vercel-CDN-Cache-Control')).toContain('public');
  });

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
