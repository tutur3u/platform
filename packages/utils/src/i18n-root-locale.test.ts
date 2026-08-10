import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

import { resolveRootLocale } from './i18n-root-locale';

describe('resolveRootLocale', () => {
  beforeEach(() => {
    mocks.notFound.mockClear();
  });

  it('accepts an explicit locale candidate', async () => {
    await expect(resolveRootLocale(['en', 'vi'], 'en')).resolves.toBe('en');
  });

  it('accepts an awaited request locale candidate', async () => {
    const requestLocale = Promise.resolve('vi');

    await expect(
      resolveRootLocale(['en', 'vi'], await requestLocale)
    ).resolves.toBe('vi');
  });

  it('rejects a missing locale candidate', async () => {
    await expect(resolveRootLocale(['en', 'vi'], undefined)).rejects.toThrow(
      'not found'
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it('rejects unknown locale candidates', async () => {
    await expect(resolveRootLocale(['en', 'vi'], 'unknown')).rejects.toThrow(
      'not found'
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
