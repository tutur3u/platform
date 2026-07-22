import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQrAppUrl, getQrAppBaseUrl } from './qr-app-url';

describe('QR app URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds the QR URL under the tools app and preserves repeated query params', () => {
    vi.stubEnv('TOOLS_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TOOLS_APP_URL', '');

    expect(
      buildQrAppUrl({
        format: ['png', 'webp'],
        value: 'https://tuturuuu.com',
      }).toString()
    ).toBe(
      'https://tools.tuturuuu.localhost/qr?format=png&format=webp&value=https%3A%2F%2Ftuturuuu.com'
    );
  });

  it('honours an explicit tools app origin', () => {
    vi.stubEnv('TOOLS_APP_URL', 'https://tools.example.com');

    expect(
      buildQrAppUrl({ utm_source: 'e2e', tag: ['a', 'b'] }).toString()
    ).toBe('https://tools.example.com/qr?utm_source=e2e&tag=a&tag=b');
  });

  it('keeps local Portless QR redirects in production-mode E2E', () => {
    vi.stubEnv('BASE_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PORTLESS_URL', 'https://tuturuuu.localhost:1355');
    vi.stubEnv('TOOLS_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TOOLS_APP_URL', '');

    expect(
      buildQrAppUrl({ utm_source: 'e2e', tag: ['a', 'b'] }).toString()
    ).toBe('https://tools.tuturuuu.localhost/qr?utm_source=e2e&tag=a&tag=b');
  });

  it('uses the production tools origin outside local runtime', () => {
    vi.stubEnv('BASE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PORTLESS_URL', '');
    vi.stubEnv('TOOLS_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_TOOLS_APP_URL', '');

    // The retired qr.tuturuuu.com host must never be produced again.
    expect(getQrAppBaseUrl().toString()).toBe('https://tools.tuturuuu.com/qr');
  });
});
