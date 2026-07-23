import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect,
}));

describe('posts page', () => {
  it('preserves filters when redirecting to daily reports', async () => {
    const { LegacyPostsRedirect } = await import('./page');

    await LegacyPostsRedirect({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
      searchParams: Promise.resolve({
        page: '2',
        stage: 'queued',
      }),
    });

    expect(redirect).toHaveBeenCalledWith(
      '/personal/reports?page=2&stage=queued&view=daily'
    );
  });
});
