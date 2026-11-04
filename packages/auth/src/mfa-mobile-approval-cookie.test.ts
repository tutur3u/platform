import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', '');
});
afterEach(() => vi.unstubAllEnvs());

async function clearedCookie() {
  const approval = await import('./mfa-mobile-approval.js');
  const response = new NextResponse(null);
  approval.clearMfaMobileApprovalCookie(response);
  return {
    cookie: response.cookies.get(approval.MFA_MOBILE_APPROVAL_COOKIE_NAME),
    requiresSecure: approval.mfaMobileApprovalCookieRequiresSecure(),
    wire: response.headers.getSetCookie(),
  };
}

describe('mobile MFA approval cookie clearing', () => {
  it('keeps the production clear bytes with no configuration', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { wire } = await clearedCookie();
    expect(wire).toEqual([
      'ttr_mfa_mobile_approval=; Path=/; Max-Age=0; Secure; SameSite=lax',
    ]);
  });

  it('keeps unprefixed development clears non-Secure', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { cookie, requiresSecure } = await clearedCookie();
    expect(cookie?.name).toBe('ttr_mfa_mobile_approval');
    expect(cookie?.secure).toBe(false);
    expect(requiresSecure).toBe(false);
  });

  it.each(['__Host-staging-', '__Secure-staging-'])(
    'marks %s clears Secure outside production',
    async (prefix) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', prefix);
      vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
      const { cookie, requiresSecure, wire } = await clearedCookie();
      expect(cookie?.name).toBe(`${prefix}ttr_mfa_mobile_approval`);
      expect(cookie?.secure).toBe(true);
      expect(cookie?.maxAge).toBe(0);
      expect(cookie?.domain).toBeUndefined();
      expect(requiresSecure).toBe(true);
      expect(wire.join('\n')).not.toContain('Domain=');
    }
  );
});
