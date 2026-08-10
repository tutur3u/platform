import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
  rootLocale: vi.fn<() => Promise<string | undefined>>(),
}));

vi.mock('next/root-params', () => ({ locale: mocks.rootLocale }));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

import { resolveRootLocale } from './i18n-root-locale';

describe('resolveRootLocale', () => {
  beforeEach(() => {
    mocks.notFound.mockClear();
    mocks.rootLocale.mockReset();
  });

  it('reads the locale from the root dynamic segment', async () => {
    mocks.rootLocale.mockResolvedValue('vi');

    await expect(resolveRootLocale(['en', 'vi'])).resolves.toBe('vi');
  });

  it('uses an explicit override without reading root params', async () => {
    await expect(resolveRootLocale(['en', 'vi'], 'en')).resolves.toBe('en');
    expect(mocks.rootLocale).not.toHaveBeenCalled();
  });

  it('rejects unknown root locale values', async () => {
    mocks.rootLocale.mockResolvedValue('unknown');

    await expect(resolveRootLocale(['en', 'vi'])).rejects.toThrow('not found');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
