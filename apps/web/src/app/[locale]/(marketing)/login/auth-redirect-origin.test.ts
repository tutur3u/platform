import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isWildcardAuthRedirectHostname,
  resolveAuthRedirectOrigin,
} from './auth-redirect-origin';

function clearConfiguredWebOrigins() {
  vi.stubEnv('WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('COOLIFY_URL', '');
  vi.stubEnv('COOLIFY_FQDN', '');
}

describe('auth redirect origin', () => {
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

  it('ignores configured non-platform app origins', () => {
    clearConfiguredWebOrigins();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chat.tuturuuu.com');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://localhost:7803',
      })
    ).toBe('http://localhost:7803');
  });

  it('uses forwarded public host headers when the current origin is wildcard', () => {
    clearConfiguredWebOrigins();

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
        request: {
          headers: new Headers({
            'x-forwarded-host': 'tuturuuu.com',
            'x-forwarded-proto': 'https',
          }),
        },
      })
    ).toBe('https://tuturuuu.com');
  });

  it('falls back to localhost outside production', () => {
    clearConfiguredWebOrigins();
    vi.stubEnv('PORT', '7803');

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
        isProduction: false,
      })
    ).toBe('http://localhost:7803');
  });

  it('falls back to the production origin in production', () => {
    clearConfiguredWebOrigins();

    expect(
      resolveAuthRedirectOrigin({
        currentOrigin: 'http://0.0.0.0:7803',
        isProduction: true,
      })
    ).toBe('https://tuturuuu.com');
  });
});
