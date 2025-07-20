import PostsClient from './client';
import type { PostEmail } from './types';
import { createClient } from '@tuturuuu/supabase/next/server';

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
  const { wsId, locale } = await params;
  const searchParamsData = await searchParams;

  const { data: postsData, count: postsCount } = await getPostsData(
    wsId,
    searchParamsData
  );

  const postsStatus = await getSentEmails(wsId, searchParamsData);
  // If you need credential, you can fetch it here as in the legacy code
  // const credential = await getWorkspaceMailCredential(wsId);

  return (
    <PostsClient
      wsId={wsId}
      locale={locale}
      postsData={postsData}
      postsCount={postsCount}
      postsStatus={postsStatus}
      searchParams={searchParamsData}
      // hasCredential={!!credential} // Uncomment if needed
    />
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
      }(post_id:id, post_title:title, post_content:content, ...workspace_user_groups(group_id:id, group_name:name)), ...sent_emails(subject)`,
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
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    referencedTable: 'user_group_posts',
    ascending: false,
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
    count,
  };
}

// Uncomment if you need credential fetching for the client
// async function getWorkspaceMailCredential(wsId: string) {
//   const supabase = await createClient();
//   const { data, error } = await supabase
//     .from('workspace_email_credentials')
//     .select('*')
//     .eq('ws_id', wsId)
//     .limit(1)
//     .maybeSingle();
//   if (error) throw error;
//   return data;
// }
