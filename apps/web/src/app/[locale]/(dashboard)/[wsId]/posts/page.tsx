import type { Metadata } from 'next';
import { headers } from 'next/headers';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import PostsClient from './client';
import type { PostEmail } from './types';

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Manage Posts in your Tuturuuu workspace.',
};

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
  cursor?: string; // For cursor-based pagination
}

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string; locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  const searchParamsData = await searchParams;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        // Combined query - fetch both posts data and sent emails count in one call
        const { postsData, sentEmailsCount } = await getPostsData(
          wsId,
          searchParamsData
        );

        return (
          <PostsClient
            wsId={wsId}
            locale={locale}
            searchParams={searchParamsData}
            postsData={postsData}
            postsStatus={sentEmailsCount}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}

async function getPostsData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    includedGroups = [],
    excludedGroups = [],
    userId,
  }: SearchParams = {}
) {
  const searchParams = new URLSearchParams({
    page,
    pageSize,
  });

  if (includedGroups) {
    const groups = Array.isArray(includedGroups)
      ? includedGroups
      : [includedGroups];
    for (const g of groups) searchParams.append('includedGroups', g);
  }

  if (excludedGroups) {
    const groups = Array.isArray(excludedGroups)
      ? excludedGroups
      : [excludedGroups];
    for (const g of groups) searchParams.append('excludedGroups', g);
  }

  if (userId) searchParams.set('userId', userId);

  const requestHeaders = await headers();
  const forwardedHeaders: Record<string, string> = {};
  requestHeaders.forEach((value, key) => {
    forwardedHeaders[key] = value;
  });

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:7803'}/api/v1/workspaces/${wsId}/posts?${searchParams.toString()}`,
    {
      cache: 'no-store',
      headers: forwardedHeaders,
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch posts data');
  }

  const { data, count } = (await response.json()) as {
    data: PostEmail[];
    count: number;
  };

  const summary = {
    queued: data.filter((item) => item.queue_status === 'queued').length,
    processing: data.filter((item) => item.queue_status === 'processing')
      .length,
    sent: data.filter((item) => item.queue_status === 'sent').length,
    failed: data.filter((item) => item.queue_status === 'failed').length,
    blocked: data.filter((item) => item.queue_status === 'blocked').length,
    cancelled: data.filter((item) => item.queue_status === 'cancelled').length,
  };

  return {
    postsData: {
      data: (data || []).map((item: any) => ({
        ...item,
        created_at: item.created_at ? new Date(item.created_at) : null,
      })),
      count: count || 0,
    },
    sentEmailsCount: summary,
  };
}
