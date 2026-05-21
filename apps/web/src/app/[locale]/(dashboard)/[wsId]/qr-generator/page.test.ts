import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildQrAppUrl: vi.fn(
    () =>
      new URL(
        'https://qr.tuturuuu.com/?format=png&format=webp&value=https%3A%2F%2Ftuturuuu.com'
      )
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

describe('workspace QR generator canonical redirect', () => {
  it('redirects to the QR app root without forwarding the workspace id', async () => {
    const QRGeneratorPage = (await import('./page')).default;

    await expect(
      QRGeneratorPage({
        searchParams: Promise.resolve({
          format: ['png', 'webp'],
          value: 'https://tuturuuu.com',
        }),
      })
    ).rejects.toThrow(
      'redirect:https://qr.tuturuuu.com/?format=png&format=webp&value=https%3A%2F%2Ftuturuuu.com'
    );

    expect(mocks.buildQrAppUrl).toHaveBeenCalledWith({
      format: ['png', 'webp'],
      value: 'https://tuturuuu.com',
    });
  });
});
