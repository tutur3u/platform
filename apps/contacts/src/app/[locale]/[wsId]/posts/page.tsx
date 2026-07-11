import type { Metadata } from 'next';
import { connection } from 'next/server';
import PostsClient from './client';
import { postsSearchParamsCache } from './search-params.server';
import type { RawPostsSearchParams } from './types';

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Manage Posts in your Tuturuuu workspace.',
};

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string; locale: string }>;
  searchParams: Promise<RawPostsSearchParams>;
}) {
  await connection();

  const { locale, wsId } = await params;
  const searchParamsData = await searchParams;
  const parsedSearchParams = await postsSearchParamsCache.parse(
    searchParamsData as Record<string, string | string[] | undefined>
  );

  return (
    <PostsClient
      wsId={wsId}
      locale={locale}
      searchParams={parsedSearchParams}
    />
  );
}
