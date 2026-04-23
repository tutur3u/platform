import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();
const getCmsUrlMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@/lib/cms-url', () => ({
  getCmsUrl: getCmsUrlMock,
}));

describe('epm collection page', () => {
  it('redirects to the CMS collection detail route', async () => {
    getCmsUrlMock.mockReturnValueOnce(
      'https://cms.tuturuuu.com/workspace-123/library/collections/collection-1'
    );

    const Page = (await import('./page')).default;

    await Page({
      params: Promise.resolve({
        collectionId: 'collection-1',
        wsId: 'workspace-123',
      }),
    });

    expect(getCmsUrlMock).toHaveBeenCalledWith(
      '/workspace-123/library/collections/collection-1'
    );
    expect(redirectMock).toHaveBeenCalledWith(
      'https://cms.tuturuuu.com/workspace-123/library/collections/collection-1'
    );
  });
});
