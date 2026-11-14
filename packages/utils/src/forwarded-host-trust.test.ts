import { describe, expect, it } from 'vitest';
import { createOriginClientIpProof } from './abuse-protection/origin-ip-proof';
import {
  getConfiguredOriginHostnames,
  hasVerifiedGatewayOriginProof,
  resolveTrustedForwardedHostname,
} from './forwarded-host-trust';

const SECRET = 'origin-secret-for-tests-0123456789abcdef';
const PROOF_ENV = {
  TRUSTED_PROXY: 'cloudflare-origin',
  TRUSTED_PROXY_ORIGIN_SECRET: SECRET,
};

function proof() {
  const value = createOriginClientIpProof({
    ip: '203.0.113.7',
    secret: SECRET,
  });
  if (!value) throw new Error('test proof could not be created');
  return value;
}

describe('getConfiguredOriginHostnames', () => {
  it('collects *_APP_URL and explicit origin variables only', () => {
    expect(
      getConfiguredOriginHostnames({
        CALENDAR_APP_URL: 'https://calendar.tuturuuu.com/',
        NEXT_PUBLIC_WEB_APP_URL: 'https://TUTURUUU.com',
        NEXT_PUBLIC_APP_URL: 'https://tasks.tuturuuu.com',
        BASE_URL: 'https://drive.tuturuuu.com',
        VERCEL_URL: 'tuturuuu-git-main.vercel.app',
        COOLIFY_FQDN: 'a.example.com, b.example.com',
        SUPABASE_URL: 'https://project.supabase.co',
        APP_URL_SUFFIX_UNRELATED: 'https://unrelated.example',
        NEXT_PUBLIC_DOCS_URL: 'https://docs.example',
        BAD_APP_URL: 'javascript:alert(1)',
      })
    ).toEqual(
      new Set([
        'calendar.tuturuuu.com',
        'tuturuuu.com',
        'tasks.tuturuuu.com',
        'drive.tuturuuu.com',
        'tuturuuu-git-main.vercel.app',
        'a.example.com',
        'b.example.com',
      ])
    );
  });
});

describe('resolveTrustedForwardedHostname', () => {
  const env = { CALENDAR_APP_URL: 'https://calendar.tuturuuu.com' };

  it('trusts a forwarded host that names a configured origin', () => {
    expect(
      resolveTrustedForwardedHostname('Calendar.tuturuuu.com', null, env)
    ).toBe('calendar.tuturuuu.com');
    expect(
      resolveTrustedForwardedHostname(
        'calendar.tuturuuu.com, evil.example',
        null,
        env
      )
    ).toBe('calendar.tuturuuu.com');
  });

  it('ignores a client forwarded host without proof', () => {
    expect(resolveTrustedForwardedHostname('evil.example', null, env)).toBe(
      null
    );
    expect(
      resolveTrustedForwardedHostname('attacker.tuturuuu.com', null, env)
    ).toBe(null);
    expect(
      resolveTrustedForwardedHostname(
        'evil.example, calendar.tuturuuu.com',
        null,
        env
      )
    ).toBe(null);
  });

  it.each([
    'calendar.tuturuuu.com/path',
    'evil.example@calendar.tuturuuu.com',
    'calendar.tuturuuu.com\r\nset-cookie: x=y',
    'calendar.tuturuuu.com:99999',
    'calendar tuturuuu.com',
    '',
  ])('rejects malformed forwarded host %j', (value) => {
    expect(resolveTrustedForwardedHostname(value, null, env)).toBe(null);
  });

  it('trusts any well-formed forwarded host with a verified gateway proof', () => {
    const headers = new Headers({ 'x-tuturuuu-origin-auth': proof() });
    expect(
      resolveTrustedForwardedHostname('preview.tuturuuu.com', headers, {
        ...env,
        ...PROOF_ENV,
      })
    ).toBe('preview.tuturuuu.com');
  });

  it('rejects forged proofs and proofs outside cloudflare-origin mode', () => {
    expect(
      resolveTrustedForwardedHostname(
        'preview.tuturuuu.com',
        new Headers({ 'x-tuturuuu-origin-auth': 'forged' }),
        { ...env, ...PROOF_ENV }
      )
    ).toBe(null);
    expect(
      resolveTrustedForwardedHostname(
        'preview.tuturuuu.com',
        new Headers({ 'x-tuturuuu-origin-auth': proof() }),
        { ...env, ...PROOF_ENV, TRUSTED_PROXY: 'cloudflare' }
      )
    ).toBe(null);
  });
});

describe('hasVerifiedGatewayOriginProof', () => {
  it('accepts the configured secret or a signed proof only', () => {
    expect(
      hasVerifiedGatewayOriginProof(
        { 'x-tuturuuu-origin-auth': SECRET },
        PROOF_ENV
      )
    ).toBe(true);
    expect(
      hasVerifiedGatewayOriginProof(
        new Headers({ 'x-tuturuuu-origin-auth': proof() }),
        PROOF_ENV
      )
    ).toBe(true);
    expect(hasVerifiedGatewayOriginProof(new Headers(), PROOF_ENV)).toBe(false);
    expect(hasVerifiedGatewayOriginProof(null, PROOF_ENV)).toBe(false);
  });
});
