import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRecoveryUrls } from './recovery';

function clearConfiguredAuthOrigins() {
  vi.stubEnv('PORTLESS_URL', '');
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('PORTLESS_PORT', '');
  vi.stubEnv('WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('COOLIFY_URL', '');
  vi.stubEnv('COOLIFY_FQDN', '');
}

describe('auth recovery URL builder', () => {
  beforeEach(() => {
    clearConfiguredAuthOrigins();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds default-locale links on the configured public origin', () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');

    const { codeUrl, confirmUrl } = buildRecoveryUrls({
      email: 'person@example.com',
      locale: 'en',
      request: new Request('http://0.0.0.0:7803/api/recovery/send-email'),
      token: 'secret-token',
    });

    const parsedCodeUrl = new URL(codeUrl);
    const parsedConfirmUrl = new URL(confirmUrl);

    expect(parsedCodeUrl.origin).toBe('https://tuturuuu.com');
    expect(parsedCodeUrl.pathname).toBe('/auth/recovery');
    expect(parsedCodeUrl.searchParams.get('email')).toBe('person@example.com');
    expect(parsedCodeUrl.searchParams.get('next')).toBe('/onboarding');
    expect(parsedConfirmUrl.origin).toBe('https://tuturuuu.com');
    expect(parsedConfirmUrl.pathname).toBe('/auth/recovery/confirm');
    expect(parsedConfirmUrl.searchParams.get('token')).toBe('secret-token');
    expect(parsedConfirmUrl.searchParams.get('next')).toBe('/onboarding');
    expect(confirmUrl).not.toContain('0.0.0.0');
    expect(confirmUrl).not.toContain('/en/');
  });

  it('keeps non-default locale links explicit', () => {
    const { codeUrl, confirmUrl } = buildRecoveryUrls({
      email: 'person@example.com',
      locale: 'vi',
      request: new Request('https://tuturuuu.com/api/recovery/send-email'),
      token: 'secret-token',
    });

    const parsedCodeUrl = new URL(codeUrl);
    const parsedConfirmUrl = new URL(confirmUrl);

    expect(parsedCodeUrl.pathname).toBe('/vi/auth/recovery');
    expect(parsedCodeUrl.searchParams.get('next')).toBe('/vi/onboarding');
    expect(parsedConfirmUrl.pathname).toBe('/vi/auth/recovery/confirm');
    expect(parsedConfirmUrl.searchParams.get('next')).toBe('/vi/onboarding');
  });

  it('canonicalizes platform http origins and default-locale next values', () => {
    const { confirmUrl } = buildRecoveryUrls({
      email: 'person@example.com',
      locale: 'en',
      next: '/en/onboarding',
      request: new Request('http://tuturuuu.com/api/recovery/send-email'),
      token: 'secret-token',
    });

    const parsedConfirmUrl = new URL(confirmUrl);

    expect(parsedConfirmUrl.origin).toBe('https://tuturuuu.com');
    expect(parsedConfirmUrl.pathname).toBe('/auth/recovery/confirm');
    expect(parsedConfirmUrl.searchParams.get('next')).toBe('/onboarding');
  });
});
