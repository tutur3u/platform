import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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
            postsData.data.map((post) => post.email).filter(Boolean) as string[]
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
    cursor,
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

  // Main query for posts data
  const queryBuilder = supabase
    .from('user_group_post_checks')
    .select(
      `notes, user_id, email_id, is_completed, created_at, user:workspace_users!inner(email, display_name, full_name, ws_id), ...user_group_posts${
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

  // Cursor-based pagination (more efficient for large datasets)
  if (cursor) {
    // Cursor format: "timestamp_userid_postid"
    const [timestamp, cursorUserId, cursorPostId] = cursor.split('_');
    if (timestamp && cursorUserId && cursorPostId) {
      queryBuilder.or(
        `created_at.lt.${timestamp},and(created_at.eq.${timestamp},user_id.gt.${cursorUserId}),and(created_at.eq.${timestamp},user_id.eq.${cursorUserId},post_id.gt.${cursorPostId})`
      );
    }
  }

  // Fallback to offset-based pagination if no cursor
  if (!cursor && page && pageSize) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = start + parsedSize - 1;
    queryBuilder.range(start, end);
  }

  const parsedSize = Number.parseInt(pageSize, 10);
  queryBuilder.limit(parsedSize);

  // Order by created_at DESC for latest first
  queryBuilder.order('created_at', {
    ascending: false,
  });

  // Build sent emails count query (using same filters)
  const sentEmailsQueryBuilder = supabase
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
    sentEmailsQueryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (
    excludedGroups &&
    (Array.isArray(excludedGroups) ? excludedGroups.length : !!excludedGroups)
  ) {
    sentEmailsQueryBuilder.not(
      'user_group_posts.group_id',
      'in',
      excludedGroups
    );
  }

  if (userId) {
    sentEmailsQueryBuilder.eq('user_id', userId);
  }

  // Execute both queries in parallel for better performance
  const [postsResult, sentEmailsResult] = await Promise.all([
    queryBuilder,
    sentEmailsQueryBuilder,
  ]);

  const { data, error, count } = postsResult;
  const { count: sentEmailsCount } = sentEmailsResult;

  if (error) {
    if (!retry) throw error;
    return getPostsData(wsId, { pageSize, retry: false });
  }

  const postsData = {
    data: (data || []).map((item) => ({
      notes: item.notes,
      user_id: item.user_id,
      email_id: item.email_id,
      is_completed: item.is_completed,
      created_at: item.created_at ? new Date(item.created_at) : null,
      ws_id: item.user?.ws_id ?? null,
      email: item.user?.email ?? null,
      recipient: item.user?.full_name || item.user?.display_name || null,
      post_id: item.post_id ?? null,
      post_title: item.post_title ?? null,
      post_content: item.post_content ?? null,
      post_created_at: item.post_created_at ?? null,
      group_id: item.group_id ?? null,
      group_name: item.group_name ?? null,
      subject: item.subject ?? null,
    })),
    count: count || 0,
  } as { data: PostEmail[]; count: number };

  return {
    postsData,
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
