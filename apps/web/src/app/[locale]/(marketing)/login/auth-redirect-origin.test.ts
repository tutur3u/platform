import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isWildcardAuthRedirectHostname,
  resolveAuthRedirectOrigin,
} from './auth-redirect-origin';

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

describe('auth redirect origin', () => {
  beforeEach(() => {
    clearConfiguredAuthOrigins();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('detects wildcard listener hostnames', () => {
    expect(isWildcardAuthRedirectHostname('0.0.0.0')).toBe(true);
    expect(isWildcardAuthRedirectHostname('::')).toBe(true);
    expect(isWildcardAuthRedirectHostname('[::]')).toBe(true);
    expect(isWildcardAuthRedirectHostname('localhost')).toBe(false);
  });

  it('prefers configured Web origins and canonicalizes platform http URLs', () => {
    vi.stubEnv('WEB_APP_URL', 'http://tuturuuu.com/');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('canonicalizes the current platform http origin to https', () => {
    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://tuturuuu.com',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('ignores configured non-platform app origins', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chat.tuturuuu.com');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://localhost:7803',
      })
    ).toBe('http://localhost:7803');
  });

  it('ignores forwarded public host headers when the current origin is wildcard', () => {
    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
        isProduction: true,
        request: {
          headers: new Headers({
            'x-forwarded-host': 'evil.test',
            'x-forwarded-proto': 'https',
          }),
        },
      })
    ).toBe('https://tuturuuu.com');
  });

  it('preserves the local Portless port before forwarded host fallback', () => {
    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'https://tuturuuu.localhost:1355',
      })
    ).toBe('https://tuturuuu.localhost:1355');
  });

  it('uses a configured Portless origin when request metadata omits the local port', () => {
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('PORTLESS_PORT', '1355');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'https://tuturuuu.localhost',
      })
    ).toBe('https://tuturuuu.localhost:1355');
  });

  it('synthesizes a Portless port before using a no-port configured Web origin', () => {
    vi.stubEnv('BASE_URL', 'https://tuturuuu.localhost');
    vi.stubEnv('PORTLESS_PORT', '1355');
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.localhost');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'https://tuturuuu.localhost',
      })
    ).toBe('https://tuturuuu.localhost:1355');
  });

  it('falls back to localhost outside production', () => {
    vi.stubEnv('PORT', '7803');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
        isProduction: false,
      })
    ).toBe('http://localhost:7803');
  });

  it('falls back to the production origin in production', () => {
    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
        isProduction: true,
      })
    ).toBe('https://tuturuuu.com');
  });
});
