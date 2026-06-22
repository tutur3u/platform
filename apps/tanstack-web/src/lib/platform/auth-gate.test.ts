import { describe, expect, it } from 'vitest';
import { buildLoginRedirectHref, isAuthenticatedProfile } from './auth-gate';

describe('buildLoginRedirectHref', () => {
  it('prefixes the locale and encodes the nextUrl', () => {
    expect(buildLoginRedirectHref('vi', '/shared/user-profile/abc')).toBe(
      '/vi/login?nextUrl=%2Fshared%2Fuser-profile%2Fabc'
    );
  });

  it('preserves and encodes a normal local nextPath', () => {
    const href = buildLoginRedirectHref('en', '/shared/user-profile/abc');

    expect(href.startsWith('/en/login?nextUrl=')).toBe(true);
    expect(href).toContain(encodeURIComponent('/shared/user-profile/abc'));
    // Decoding the nextUrl param must round-trip back to the original path.
    expect(
      decodeURIComponent(
        new URL(href, 'https://x.local').searchParams.get('nextUrl') ?? ''
      )
    ).toBe('/shared/user-profile/abc');
  });

  it('does not double-encode the nextUrl', () => {
    const href = buildLoginRedirectHref('en', '/a b/c?d=1&e=2');
    const nextUrl =
      new URL(href, 'https://x.local').searchParams.get('nextUrl') ?? '';

    // searchParams decodes once; a double-encoded value would still contain %.
    expect(nextUrl).toBe('/a b/c?d=1&e=2');
  });

  it('falls back to the default locale when locale is empty', () => {
    expect(buildLoginRedirectHref('', '/dashboard')).toBe(
      '/en/login?nextUrl=%2Fdashboard'
    );
  });

  it('falls back to the default locale when locale is whitespace', () => {
    expect(buildLoginRedirectHref('   ', '/dashboard')).toBe(
      '/en/login?nextUrl=%2Fdashboard'
    );
  });

  it('falls back to the default locale when locale is missing', () => {
    expect(
      buildLoginRedirectHref(undefined as unknown as string, '/dashboard')
    ).toBe('/en/login?nextUrl=%2Fdashboard');
  });

  it('coerces an absolute https url to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', 'https://evil.com')).toBe(
      '/en/login?nextUrl=%2F'
    );
  });

  it('coerces a protocol-relative url to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', '//evil.com')).toBe(
      '/en/login?nextUrl=%2F'
    );
  });

  it('coerces a javascript: scheme to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', 'javascript:alert(1)')).toBe(
      '/en/login?nextUrl=%2F'
    );
  });

  it('coerces a backslash-bearing path to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', '/\\evil.com')).toBe(
      '/en/login?nextUrl=%2F'
    );
  });

  it('coerces a control-character path to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', '/\n/evil')).toBe(
      '/en/login?nextUrl=%2F'
    );
  });

  it('coerces a non-rooted relative path to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', 'dashboard')).toBe(
      '/en/login?nextUrl=%2F'
    );
  });

  it('coerces a non-string nextPath to / (open-redirect guard)', () => {
    expect(buildLoginRedirectHref('en', undefined as unknown as string)).toBe(
      '/en/login?nextUrl=%2F'
    );
  });
});

describe('isAuthenticatedProfile', () => {
  it('returns true for an object with a non-empty string id', () => {
    expect(isAuthenticatedProfile({ id: 'u_1' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isAuthenticatedProfile(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAuthenticatedProfile(undefined)).toBe(false);
  });

  it('returns false for an empty object', () => {
    expect(isAuthenticatedProfile({})).toBe(false);
  });

  it('returns false for an empty string id', () => {
    expect(isAuthenticatedProfile({ id: '' })).toBe(false);
  });

  it('returns false for a numeric id', () => {
    expect(isAuthenticatedProfile({ id: 123 })).toBe(false);
  });

  it('returns false for a string primitive', () => {
    expect(isAuthenticatedProfile('string')).toBe(false);
  });
});
