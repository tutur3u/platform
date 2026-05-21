import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildQrAppUrl } from './qr-app-url';

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
});
