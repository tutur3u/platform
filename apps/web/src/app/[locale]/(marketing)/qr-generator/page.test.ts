import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildQrAppUrl: vi.fn(
    () => new URL('https://tools.tuturuuu.com/qr?value=hello')
  ),
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
  it('redirects to the QR generator in the tools app and preserves the query string', async () => {
    const QRGeneratorPage = (await import('./page')).default;

    await expect(
      QRGeneratorPage({
        searchParams: Promise.resolve({
          value: 'hello',
        }),
      })
    ).rejects.toThrow('redirect:https://tools.tuturuuu.com/qr?value=hello');

    expect(mocks.buildQrAppUrl).toHaveBeenCalledWith({
      value: 'hello',
    });
  });
});
