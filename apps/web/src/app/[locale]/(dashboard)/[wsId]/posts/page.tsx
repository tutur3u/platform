import { createClient } from '@tuturuuu/supabase/next/server';
import type { Metadata } from 'next';
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
        const postsData = await getPostsData(wsId, searchParamsData);
        const postsStatus = await getSentEmails(wsId, searchParamsData);

        return (
          <PostsClient
            wsId={wsId}
            locale={locale}
            searchParams={searchParamsData}
            postsData={postsData}
            postsStatus={postsStatus}
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
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const hasFilters =
    (Array.isArray(includedGroups)
      ? includedGroups.length
      : !!includedGroups) ||
    (Array.isArray(excludedGroups)
      ? excludedGroups.length
      : !!excludedGroups) ||
    !!userId;

  const queryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      `notes, user_id, email_id, is_completed, user:workspace_users!inner(email, display_name, full_name, ws_id), ...user_group_posts${
        hasFilters ? '!inner' : ''
      }(post_id:id, post_title:title, post_content:content, post_created_at:created_at, ...workspace_user_groups(group_id:id, group_name:name)), ...sent_emails(subject)`,
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (
    includedGroups &&
    (Array.isArray(includedGroups) ? includedGroups.length : !!includedGroups)
  ) {
    queryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (
    excludedGroups &&
    (Array.isArray(excludedGroups) ? excludedGroups.length : !!excludedGroups)
  ) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }

  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page);
    const parsedSize = Number.parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = start + parsedSize - 1; // Fix: end should be start + size - 1
    queryBuilder.range(start, end).limit(parsedSize);
  }

  // Order by created_at (actual post creation date in user_group_posts), latest first
  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false, // descending order: latest first
  });

  if (error) {
    if (!retry) throw error;
    return getPostsData(wsId, { pageSize, retry: false });
  }

  return {
    data: (data || []).map(({ user, ...rest }) => ({
      ...rest,
      ws_id: user?.ws_id,
      email: user?.email,
      recipient: user?.full_name || user?.display_name,
    })),
    count: count || 0,
  } as { data: PostEmail[]; count: number };
}

async function getSentEmails(
  wsId: string,
  {
    includedGroups = [],
    excludedGroups = [],
    userId,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
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

  if (
    includedGroups &&
    (Array.isArray(includedGroups) ? includedGroups.length : !!includedGroups)
  ) {
    queryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (
    excludedGroups &&
    (Array.isArray(excludedGroups) ? excludedGroups.length : !!excludedGroups)
  ) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }

  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  const { count } = await queryBuilder;

  return {
    count: count || 0,
  };
}
