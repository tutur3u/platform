import { describe, expect, it } from 'vitest';
import {
  getTurnstileClientErrorMessageKey,
  isLocalSupabaseUrl,
  shouldRequireTurnstileForLocalDevAuth,
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

  it('requires Turnstile for local dev auth unless the E2E auth bypass is active', () => {
    expect(
      shouldRequireTurnstileForLocalDevAuth({
        devMode: true,
        localE2EAuthBypass: false,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(true);
    expect(
      shouldRequireTurnstileForLocalDevAuth({
        devMode: true,
        localE2EAuthBypass: true,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
    expect(
      shouldRequireTurnstileForLocalDevAuth({
        devMode: false,
        localE2EAuthBypass: false,
        supabaseUrl: 'http://127.0.0.1:8001',
      })
    ).toBe(false);
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
