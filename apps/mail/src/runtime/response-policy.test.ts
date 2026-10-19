import { describe, expect, it } from 'vitest';
import { applyMailResponsePolicy } from './response-policy';

describe('Mail response policy inherited from Next configuration', () => {
  it('keeps private indexing and anti-framing on redirects and dynamic pages', () => {
    const response = applyMailResponsePolicy(
      new Request('https://mail.tuturuuu.com/personal/inbox'),
      new Response(null, { status: 307, headers: { location: '/login' } })
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/login');
    expect(response.headers.get('x-robots-tag')).toBe(
      'noindex, nofollow, nosnippet'
    );
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('retains the specific existing embeddable exception without exempting other routes', () => {
    const path =
      '/api/v1/workspaces/tenant/external-projects/assets/object/webgl';
    const exception = applyMailResponsePolicy(
      new Request(`https://mail.tuturuuu.com${path}`),
      new Response('frame')
    );
    expect(exception.headers.has('x-frame-options')).toBe(false);
    const privateRoute = applyMailResponsePolicy(
      new Request(`https://mail.tuturuuu.com${path}-other`),
      new Response('private')
    );
    expect(privateRoute.headers.get('x-frame-options')).toBe('DENY');
  });
  it('preserves multiple cookies and attachment stream metadata', async () => {
    const source = new Response('abc', {
      status: 206,
      headers: {
        'content-range': 'bytes 1-3/6',
        'cache-control': 'private, max-age=60',
      },
    });
    source.headers.append('set-cookie', 'one=1; HttpOnly');
    source.headers.append('set-cookie', 'two=2; HttpOnly');
    const response = applyMailResponsePolicy(
      new Request('https://mail.tuturuuu.com/api/attachment'),
      source
    );
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get('cache-control')).toBe('private, max-age=60');
    expect(response.headers.get('content-range')).toBe('bytes 1-3/6');
    expect(await response.text()).toBe('abc');
  });
  it('retains an owner CSP and owner frame option byte-for-byte', () => {
    const ownerCsp = "sandbox; default-src 'none'; frame-ancestors 'self'";
    const response = applyMailResponsePolicy(
      new Request('https://mail.tuturuuu.com/api/owner'),
      new Response('owned', {
        headers: {
          'Content-Security-Policy': ownerCsp,
          'X-Frame-Options': 'SAMEORIGIN',
        },
      })
    );
    expect(response.headers.get('content-security-policy')).toBe(ownerCsp);
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
  it('does not grant the attachment framing exception from pathname alone', () => {
    const url =
      'https://mail.tuturuuu.com/api/v1/workspaces/tenant/mail/mailboxes/box/messages/message/attachments/attachment';
    const missing = applyMailResponsePolicy(
      new Request(url),
      new Response(null, { status: 404 })
    );
    expect(missing.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
    expect(missing.headers.get('x-frame-options')).toBe('DENY');
    const strict = applyMailResponsePolicy(
      new Request(url),
      new Response('owned', {
        headers: {
          'content-security-policy':
            "sandbox; default-src 'none'; frame-ancestors 'none'",
        },
      })
    );
    expect(strict.headers.get('content-security-policy')).toBe(
      "sandbox; default-src 'none'; frame-ancestors 'none'"
    );
    expect(strict.headers.get('x-frame-options')).toBe('DENY');
    const otherOwner = applyMailResponsePolicy(
      new Request('https://mail.tuturuuu.com/api/other'),
      new Response('owned', {
        headers: { 'content-security-policy': "frame-ancestors 'self'" },
      })
    );
    expect(otherOwner.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'self'"
    );
    expect(otherOwner.headers.get('x-frame-options')).toBe('DENY');
  });
});
