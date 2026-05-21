import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildQrAppUrl: vi.fn(() => new URL('https://qr.tuturuuu.com/?value=hello')),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock('@/lib/qr-app-url', () => {
  return {
    buildQrAppUrl: mocks.buildQrAppUrl,
  };
});

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

describe('marketing QR generator canonical redirect', () => {
  it('redirects to the QR app root and preserves the query string', async () => {
    const QRGeneratorPage = (await import('./page')).default;

    await expect(
      QRGeneratorPage({
        searchParams: Promise.resolve({
          value: 'hello',
        }),
      })
    ).rejects.toThrow('redirect:https://qr.tuturuuu.com/?value=hello');

    expect(mocks.buildQrAppUrl).toHaveBeenCalledWith({
      value: 'hello',
    });
  });
});
