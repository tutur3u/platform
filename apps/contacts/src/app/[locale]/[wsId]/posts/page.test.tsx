import { describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  default: ({
    locale,
    searchParams,
    wsId,
  }: {
    locale: string;
    searchParams: unknown;
    wsId: string;
  }) => ({
    type: 'posts-client',
    props: { locale, searchParams, wsId },
  }),
}));

describe('posts page', () => {
  it('renders the client shell without server-side workspace fetches', async () => {
    const { default: PostsPage } = await import('./page');

    const result = await PostsPage({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
      searchParams: Promise.resolve({
        page: '2',
        stage: 'queued',
      }),
    });

    expect(result.props).toMatchObject({
      locale: 'en',
      wsId: 'personal',
    });
    expect(result.props.searchParams).toMatchObject({
      page: 2,
      stage: 'queued',
    });
  });
});
