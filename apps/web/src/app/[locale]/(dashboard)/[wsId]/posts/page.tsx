import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import PostsClient from './client';

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

        // Extract unique emails from posts data and check blacklist status
        const userEmails = [
          ...new Set(
            postsData.data
              .map((post: { email: string | null }) => post.email)
              .filter(Boolean) as string[]
          ),
        ];
        const blacklistedEmails = await getEmailBlacklistStatus(userEmails);

        return (
          <PostsClient
            wsId={wsId}
            locale={locale}
            searchParams={searchParamsData}
            postsData={postsData}
            postsStatus={{ count: sentEmailsCount }}
            blacklistedEmails={blacklistedEmails}
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

  const { data, count } = await response.json();

  // For sent emails count, we might need a separate API or just use the count from the same API if it's filtered correctly
  // Original code had a separate query for sent emails count.
  // Let's assume the API returns what we need or we can add a separate count API.
  // The original sentEmailsQueryBuilder was:
  /*
  const sentEmailsQueryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      'workspace_users!inner(ws_id), sent_emails!inner(*), user_group_posts!inner(group_id)',
      {
        head: true,
        count: 'exact',
      }
    )
  */
  // This counts total sent emails.

  const sbAdmin = await createAdminClient();
  const sentEmailsQueryBuilder = sbAdmin
    .from('user_group_post_checks')
    .select(
      'workspace_users!inner(ws_id), sent_emails!inner(*), user_group_posts!inner(group_id)',
      {
        head: true,
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (includedGroups) {
    const groups = Array.isArray(includedGroups)
      ? includedGroups
      : [includedGroups];
    if (groups.length > 0)
      sentEmailsQueryBuilder.in('user_group_posts.group_id', groups);
  }

  if (excludedGroups) {
    const groups = Array.isArray(excludedGroups)
      ? excludedGroups
      : [excludedGroups];
    if (groups.length > 0)
      sentEmailsQueryBuilder.not('user_group_posts.group_id', 'in', groups);
  }

  if (userId) {
    sentEmailsQueryBuilder.eq('user_id', userId);
  }

  const { count: sentEmailsCount } = await sentEmailsQueryBuilder;

  return {
    postsData: {
      data: (data || []).map((item: any) => ({
        ...item,
        created_at: item.created_at ? new Date(item.created_at) : null,
      })),
      count: count || 0,
    },
    sentEmailsCount: sentEmailsCount || 0,
  };
}

async function getEmailBlacklistStatus(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();

  const sbAdmin = await createAdminClient();
  const { data: blockStatuses, error } = await sbAdmin.rpc(
    'get_email_block_statuses',
    { p_emails: emails }
  );

  if (error) {
    console.error('Error checking email blacklist:', error);
    return new Set();
  }

  const blacklistedEmails = new Set(
    (blockStatuses || [])
      .filter((status) => status.is_blocked && status.email)
      .map((status) => status.email as string)
  );

  return blacklistedEmails;
}
