import { describe, expect, it } from 'vitest';
import {
  getTurnstileClientErrorMessageKey,
  isLocalSupabaseUrl,
  resolveLoginTurnstileClientState,
  shouldBypassTurnstileForLocalSupabaseDevAuth,
  shouldHonorLocalE2EAuthBypassForLogin,
  shouldRequireTurnstileForDevAuth,
  shouldRetryTurnstileClientError,
} from './turnstile-state';

describe('login Turnstile state', () => {
  it('detects local Supabase URLs', () => {
    expect(isLocalSupabaseUrl('http://127.0.0.1:8001')).toBe(true);
    expect(isLocalSupabaseUrl('http://localhost:8001')).toBe(true);
    expect(isLocalSupabaseUrl('http://[::1]:8001')).toBe(true);
  });

  it('ignores remote or malformed Supabase URLs', () => {
    expect(isLocalSupabaseUrl('https://project.supabase.co')).toBe(false);
    expect(isLocalSupabaseUrl('not a url')).toBe(false);
    expect(isLocalSupabaseUrl(undefined)).toBe(false);
  });

  it('does not require Turnstile for local Supabase dev auth', () => {
    expect(
      shouldRequireTurnstileForDevAuth({
        devMode: true,
        localE2EAuthBypass: false,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
    expect(
      shouldBypassTurnstileForLocalSupabaseDevAuth({
        devMode: true,
        localE2EAuthBypass: false,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(true);
  });

  it('requires Turnstile for remote dev auth when configured', () => {
    expect(
      shouldRequireTurnstileForDevAuth({
        devMode: true,
        localE2EAuthBypass: false,
        supabaseUrl: 'https://project.supabase.co',
      })
    ).toBe(true);
    expect(
      shouldRequireTurnstileForDevAuth({
        devMode: true,
        localE2EAuthBypass: true,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
    expect(
      shouldRequireTurnstileForDevAuth({
        devMode: false,
        localE2EAuthBypass: false,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
  });

  it('keeps configured Turnstile disabled for local Supabase dev passkeys', () => {
    expect(
      resolveLoginTurnstileClientState({
        devMode: true,
        localE2EAuthBypass: false,
        siteKey: '0x4AAAA-local-incompatible-key',
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toEqual({
      siteKey: '0x4AAAA-local-incompatible-key',
      isRequired: false,
      canRenderWidget: false,
    });
  });

  it('keeps configured Turnstile disabled for production-built local Supabase E2E auth', () => {
    expect(
      shouldBypassTurnstileForLocalSupabaseDevAuth({
        devMode: false,
        localE2EAuthBypass: false,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(true);
    expect(
      resolveLoginTurnstileClientState({
        devMode: false,
        localE2EAuthBypass: false,
        siteKey: 'site-key',
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: false,
      canRenderWidget: false,
    });
  });

  it('keeps configured Turnstile enabled for remote dev auth', () => {
    expect(
      resolveLoginTurnstileClientState({
        devMode: true,
        localE2EAuthBypass: false,
        siteKey: 'site-key',
        supabaseUrl: 'https://project.supabase.co',
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: true,
      canRenderWidget: true,
    });
  });

  it('only honors the public local E2E bypass for local Supabase auth', () => {
    expect(
      shouldHonorLocalE2EAuthBypassForLogin({
        devMode: true,
        publicLocalE2EAuthBypass: true,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(true);

    expect(
      shouldHonorLocalE2EAuthBypassForLogin({
        devMode: true,
        publicLocalE2EAuthBypass: true,
        supabaseUrl: 'https://project.supabase.co',
      })
    ).toBe(false);

    expect(
      resolveLoginTurnstileClientState({
        devMode: true,
        localE2EAuthBypass: shouldHonorLocalE2EAuthBypassForLogin({
          devMode: true,
          publicLocalE2EAuthBypass: true,
          supabaseUrl: 'https://project.supabase.co',
        }),
        siteKey: 'site-key',
        supabaseUrl: 'https://project.supabase.co',
      })
    ).toEqual({
      siteKey: 'site-key',
      isRequired: true,
      canRenderWidget: true,
    });
  });

  it('treats Turnstile domain authorization errors as non-retryable config errors', () => {
    expect(getTurnstileClientErrorMessageKey('110200')).toBe(
      'captcha_domain_not_authorized'
    );
    expect(shouldRetryTurnstileClientError('110200')).toBe(false);
    expect(getTurnstileClientErrorMessageKey('100000')).toBe('captcha_error');
    expect(shouldRetryTurnstileClientError('100000')).toBe(true);
  });
});
