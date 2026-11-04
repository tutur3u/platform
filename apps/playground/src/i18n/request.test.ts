import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getRequestConfig: (factory: unknown) => factory,
}));

const { default: requestConfig } = await import('./request');

describe('playground i18n request config', () => {
  it('is English-only with no message catalog', async () => {
    const factory = requestConfig as unknown as () => Promise<unknown>;
    await expect(factory()).resolves.toEqual({ locale: 'en', messages: {} });
  });
});
