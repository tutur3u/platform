import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthCookieName,
  getAuthCookieScope,
  getSupabaseAuthStorageKey,
  getSupabaseCookieOptions,
} from '../common';

const project = 'https://fxefojytwimjiqxseqag.supabase.co';

describe('auth cookie deployment configuration', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('preserves production cookie names and options exactly by default', () => {
    expect(getAuthCookieName('tuturuuu_app_session')).toBe(
      'tuturuuu_app_session'
    );
    expect(getSupabaseAuthStorageKey(project)).toBe(
      'sb-fxefojytwimjiqxseqag-auth-token'
    );
    expect(getAuthCookieScope('host-only')).toBe('host-only');
    expect(getSupabaseCookieOptions(project, 'https://tuturuuu.com')).toEqual({
      name: 'sb-fxefojytwimjiqxseqag-auth-token',
      path: '/',
      sameSite: 'lax',
      domain: '.tuturuuu.com',
      secure: true,
    });
  });

  it.each([
    'tuturuuu_app_session',
    'tuturuuu_web_app_session',
    'tuturuuu_app_session_refresh',
    'tuturuuu_web_app_session_refresh',
  ])('preserves the production lookup name %s byte for byte', (name) => {
    expect(getAuthCookieName(name)).toBe(name);
  });

  it('never emits a production name or parent domain with staging configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', 'staging-');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    for (const origin of [
      'https://staging.tuturuuu.com',
      'https://tuturuuu-staging.com',
    ]) {
      const options = getSupabaseCookieOptions(project, origin);
      expect(options.name).toBe('staging-sb-fxefojytwimjiqxseqag-auth-token');
      expect(options).not.toHaveProperty('domain');
      expect(options.secure).toBe(true);
      expect(getAuthCookieName('tuturuuu_app_session')).toBe(
        'staging-tuturuuu_app_session'
      );
    }
  });

  it('supports explicit parent-domain scope without changing the default name', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'parent-domain');
    expect(
      getSupabaseCookieOptions(project, 'https://calendar.tuturuuu.com').domain
    ).toBe('.tuturuuu.com');
  });

  it('rejects malformed scope and cookie prefixes instead of silently sharing', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-onyl');
    expect(() => getAuthCookieScope()).toThrow('NEXT_PUBLIC_AUTH_COOKIE_SCOPE');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    vi.stubEnv(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX',
      'stage; Domain=.tuturuuu.com'
    );
    expect(() => getAuthCookieName('tuturuuu_app_session')).toThrow(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX'
    );
  });

  it('requires host-only scope for a browser-enforced Host prefix', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', '__Host-staging-');
    expect(getAuthCookieScope()).toBe('host-only');
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'parent-domain');
    expect(() => getAuthCookieName('tuturuuu_app_session')).toThrow(
      'host-only'
    );
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
    expect(
      getSupabaseCookieOptions(project, 'https://staging.tuturuuu.com')
    ).toEqual({
      name: '__Host-staging-sb-fxefojytwimjiqxseqag-auth-token',
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  });
});

it('keeps browser-enforced prefixes ahead of a deployment cookie namespace', () => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', 'staging-');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', 'host-only');
  try {
    expect(getAuthCookieName('__Host-device')).toBe('__Host-staging-device');
    expect(getAuthCookieName('__Secure-device')).toBe(
      '__Secure-staging-device'
    );
  } finally {
    vi.unstubAllEnvs();
  }
});

it.each([
  'sb-stage-',
  'tuturuuu_stage_',
  'ttr_stage_',
  'staging',
  '__Host-sb-stage-',
])('rejects ambiguous namespace %s', (prefix) => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', prefix);
  try {
    expect(() => getAuthCookieName('name')).toThrow(
      'NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX'
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
it.each([
  'http://staging.tuturuuu.com',
  'http://tuturuuu-staging.com',
  'https://staging.tuturuuu.com',
])('defaults a namespace to secure host-only cookies on %s', (origin) => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', 'staging-');
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_SCOPE', '');
  try {
    expect(getSupabaseCookieOptions(project, origin)).toEqual({
      name: 'staging-sb-fxefojytwimjiqxseqag-auth-token',
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
it.each([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
  'http://web.localhost:3000',
])('allows HTTP host-only local development on %s', (origin) => {
  vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', 'staging-');
  try {
    expect(getSupabaseCookieOptions(project, origin)).toMatchObject({
      secure: false,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});

it('preserves SDK default cookie names without a Node process global', () => {
  let actual: { name: string; scope: string; key: string } | undefined;
  vi.stubGlobal('process', undefined);
  try {
    actual = {
      name: getAuthCookieName('tuturuuu_app_session'),
      scope: getAuthCookieScope(),
      key: getSupabaseAuthStorageKey(project),
    };
  } finally {
    vi.unstubAllGlobals();
  }
  expect(actual).toEqual({
    name: 'tuturuuu_app_session',
    scope: 'parent-domain',
    key: 'sb-fxefojytwimjiqxseqag-auth-token',
  });
});

it.each(['__Host-', '__Secure-', '__Host-_-', '__Secure-__'])(
  'requires a namespace segment after reserved browser prefix %s',
  (prefix) => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_NAME_PREFIX', prefix);
    try {
      expect(() => getAuthCookieName('tuturuuu_app_session')).toThrow(
        'non-empty namespace segment'
      );
    } finally {
      vi.unstubAllEnvs();
    }
  }
);
