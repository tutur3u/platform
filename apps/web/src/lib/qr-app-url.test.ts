import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQrAppUrl, getQrAppOrigin } from './qr-app-url';

describe('QR app URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds the QR app root URL and preserves repeated query params', () => {
    vi.stubEnv('QR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_QR_APP_URL', '');

    expect(
      buildQrAppUrl({
        format: ['png', 'webp'],
        value: 'https://tuturuuu.com',
      }).toString()
    ).toBe(
      'https://qr.tuturuuu.localhost/?format=png&format=webp&value=https%3A%2F%2Ftuturuuu.com'
    );
  });

  it('keeps local Portless QR redirects in production-mode E2E', () => {
    vi.stubEnv('BASE_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('QR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_QR_APP_URL', '');

    expect(
      buildQrAppUrl({
        utm_source: 'e2e',
        tag: ['a', 'b'],
      }).toString()
    ).toBe('https://qr.tuturuuu.localhost/?utm_source=e2e&tag=a&tag=b');
  });

  it('uses the production QR origin outside local Portless runtime', () => {
    vi.stubEnv('BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PORTLESS_URL', '');
    vi.stubEnv('QR_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_QR_APP_URL', '');

    expect(getQrAppOrigin()).toBe('https://qr.tuturuuu.com');
  });
});
