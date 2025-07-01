import { createClient } from '@tuturuuu/supabase/next/server';
import type { PostEmail } from '@tuturuuu/types/primitives/post-email';
import { cookies } from 'next/headers';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import MailClientWrapper from './client';

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams?: Promise<SearchParams>;
}

export default async function MailPage({ params, searchParams }: Props) {
  const { locale, wsId } = await params;
  const searchParamsData = searchParams ? await searchParams : {};

  // Read layout preferences for resizable panels & sidebar state
  const layoutCookie = (await cookies()).get(
    'react-resizable-panels:layout:mail'
  );
  const collapsedCookie = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultLayout = layoutCookie
    ? JSON.parse(layoutCookie.value)
    : undefined;
  const defaultCollapsed = collapsedCookie
    ? JSON.parse(collapsedCookie.value)
    : undefined;

  // Fetch posts data
  const { data: postsData, count: postsCount } = await getPostsData(
    wsId,
    searchParamsData
  );
  const postsStatus = await getSentEmails(wsId, searchParamsData);

  return (
    <MailClientWrapper
      wsId={wsId}
      locale={locale}
      defaultLayout={defaultLayout}
      defaultCollapsed={defaultCollapsed}
      postsData={postsData}
      postsCount={postsCount}
      postsStatus={postsStatus}
      searchParams={searchParamsData}
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
    includedGroups.length > 0 || excludedGroups.length > 0 || userId;

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

  if (includedGroups.length > 0) {
    queryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (excludedGroups.length > 0) {
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
    data: data.map(({ user, ...rest }) => ({
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

  if (includedGroups.length > 0) {
    queryBuilder.in(
      'user_group_posts.group_id',
      Array.isArray(includedGroups) ? includedGroups : [includedGroups]
    );
  }

  if (excludedGroups.length > 0) {
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
