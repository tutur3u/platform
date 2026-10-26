import { describe, expect, it } from 'vitest';
import {
  type AppSecurityProfile,
  applyDocumentSecurityHeaders,
  buildPermissionsPolicy,
  buildReportOnlyCsp,
  DEFAULT_PERMISSIONS,
  originSources,
} from '../security-headers';

const profile: AppSecurityProfile = {
  basePath: '/meet',
  connect: ['wss://meet-realtime.tuturuuu.com'],
  permissions: { ...DEFAULT_PERMISSIONS, camera: 'self', microphone: 'self' },
};
const shared = {
  requestOrigin: 'https://tuturuuu.com',
  sharedOrigin: 'https://tuturuuu.com',
};
const directive = (csp: string, name: string) =>
  csp.split('; ').find((part) => part.startsWith(`${name} `));
const html = (headers: Record<string, string> = {}) =>
  new Response('<!doctype html>', {
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });

describe('buildReportOnlyCsp', () => {
  it('scopes self to the app mount and the central API on the shared origin', () => {
    const csp = buildReportOnlyCsp(profile, shared);
    expect(directive(csp, 'connect-src')).toBe(
      'connect-src https://tuturuuu.com/meet/ https://tuturuuu.com/api/ wss://meet-realtime.tuturuuu.com'
    );
    expect(csp).not.toContain("'self'");
    expect(csp).not.toContain('https://tuturuuu.com/mail');
  });

  it("uses 'self' on the app's own subdomain", () => {
    const csp = buildReportOnlyCsp(profile, {
      ...shared,
      requestOrigin: 'https://meet.tuturuuu.com',
    });
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
  });

  it('never allows inline or eval scripts and requires Trusted Types', () => {
    const csp = buildReportOnlyCsp(profile, shared);
    expect(directive(csp, 'script-src')).not.toMatch(/unsafe/u);
    for (const part of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "require-trusted-types-for 'script'",
    ])
      expect(csp).toContain(part);
    expect(csp).not.toContain('report-uri');
    expect(
      buildReportOnlyCsp(profile, { ...shared, reportUri: '/csp' })
    ).toContain('report-uri /csp');
  });
});

describe('permissions and sources', () => {
  it('serialises every feature explicitly', () => {
    expect(buildPermissionsPolicy(DEFAULT_PERMISSIONS)).toBe(
      'autoplay=(self), camera=(), display-capture=(), fullscreen=(self), geolocation=(), microphone=(), payment=(), usb=()'
    );
    expect(buildPermissionsPolicy(profile.permissions)).toContain(
      'camera=(self)'
    );
  });

  it('derives origins and websocket origins from configured URLs', () => {
    expect(originSources('https://abc.supabase.co/rest', true)).toEqual([
      'https://abc.supabase.co',
      'wss://abc.supabase.co',
    ]);
    expect(originSources('not a url')).toEqual([]);
    expect(originSources(undefined)).toEqual([]);
  });
});

describe('applyDocumentSecurityHeaders', () => {
  it('adds headers to HTML documents only', () => {
    const page = applyDocumentSecurityHeaders(html(), profile, shared);
    expect(page.headers.get('x-content-type-options')).toBe('nosniff');
    expect(page.headers.get('permissions-policy')).toContain('camera=(self)');
    expect(page.headers.get('content-security-policy-report-only')).toContain(
      'default-src'
    );
    expect(page.headers.get('content-security-policy')).toBeNull();
    const json = applyDocumentSecurityHeaders(
      Response.json({ ok: true }),
      profile,
      shared
    );
    expect(json.headers.get('permissions-policy')).toBeNull();
  });

  it('never overrides a policy the app already set', () => {
    const page = applyDocumentSecurityHeaders(
      html({
        'Permissions-Policy': 'camera=()',
        'Referrer-Policy': 'no-referrer',
      }),
      profile,
      shared
    );
    expect(page.headers.get('permissions-policy')).toBe('camera=()');
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('passes WebSocket upgrades through untouched', () => {
    const upgrade = { status: 101 } as Response;
    expect(applyDocumentSecurityHeaders(upgrade, profile, shared)).toBe(
      upgrade
    );
  });
});
