import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import {
  autoSkipOldPostEmails,
  getPostEmailMaxAgeCutoff,
  getPostEmailQueueRows,
  summarizePostEmailQueue,
} from '@/lib/post-email-queue';
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
        const permissions = await getPermissions({ wsId });

        const canApprovePosts =
          permissions?.containsPermission('send_user_group_post_emails') ??
          false;

        // Combined query - fetch both posts data and sent emails count in one call
        const { postsData, sentEmailsCount } = await getPostsData(
          wsId,
          searchParamsData
        );

        return (
          <PostsClient
            wsId={wsId}
            locale={locale}
            canApprovePosts={canApprovePosts}
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
  const sbAdmin = await createAdminClient();
  const parsedPage = Number.parseInt(page, 10);
  const parsedSize = Number.parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedSize;
  const end = start + parsedSize - 1;
  const includedGroupIds = Array.isArray(includedGroups)
    ? includedGroups
    : includedGroups
      ? [includedGroups]
      : [];
  const excludedGroupIds = Array.isArray(excludedGroups)
    ? excludedGroups
    : excludedGroups
      ? [excludedGroups]
      : [];
  const hasFilters =
    includedGroupIds.length > 0 || excludedGroupIds.length > 0 || !!userId;
  const cutoff = getPostEmailMaxAgeCutoff();

  await autoSkipOldPostEmails(sbAdmin, { wsId });

  const queryBuilder = sbAdmin
    .from('user_group_post_checks')
    .select(
      `post_id, notes, user_id, email_id, is_completed, approval_status, rejection_reason, user:workspace_users!user_id!inner(email, display_name, full_name, ws_id), user_group_posts${hasFilters ? '!inner' : ''}(id, title, content, group_id, created_at, workspace_user_groups(id, name)), sent_emails(subject)`,
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%')
    .gte('user_group_posts.created_at', cutoff)
    .order('created_at', { ascending: false })
    .range(start, end)
    .limit(parsedSize);

  if (includedGroupIds.length > 0) {
    queryBuilder.in('user_group_posts.group_id', includedGroupIds);
  }
  if (excludedGroupIds.length > 0) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroupIds);
  }
  if (userId) {
    queryBuilder.eq('user_id', userId);
  }

  const { data: rows, error, count } = await queryBuilder;

  if (error) {
    throw new Error(error.message);
  }

  const postIds = [
    ...new Set((rows ?? []).map((item: any) => item.post_id).filter(Boolean)),
  ];
  const queueRows = await getPostEmailQueueRows(sbAdmin, postIds);
  const queueByPostAndUser = new Map<string, (typeof queueRows)[number]>();
  const queueByPost = new Map<string, typeof queueRows>();

  for (const row of queueRows) {
    queueByPostAndUser.set(`${row.post_id}:${row.user_id}`, row);
    const rowsForPost = queueByPost.get(row.post_id) ?? [];
    rowsForPost.push(row);
    queueByPost.set(row.post_id, rowsForPost);
  }

  const data = (rows ?? []).map((item: any) => {
    const queueRow = queueByPostAndUser.get(`${item.post_id}:${item.user_id}`);
    const queueCounts = item.post_id
      ? summarizePostEmailQueue(queueByPost.get(item.post_id) ?? [])
      : summarizePostEmailQueue([]);

    return {
      notes: item.notes,
      user_id: item.user_id,
      email_id: item.email_id,
      is_completed: item.is_completed,
      ws_id: item.user?.ws_id,
      email: item.user?.email,
      recipient: item.user?.full_name || item.user?.display_name,
      post_id: item.user_group_posts?.id,
      post_title: item.user_group_posts?.title,
      post_content: item.user_group_posts?.content,
      group_id: item.user_group_posts?.group_id,
      group_name: item.user_group_posts?.workspace_user_groups?.name,
      subject: item.sent_emails?.subject,
      queue_status: queueRow?.status ?? (item.email_id ? 'sent' : 'queued'),
      queue_attempt_count: queueRow?.attempt_count ?? 0,
      queue_last_error: queueRow?.last_error ?? null,
      queue_sent_at: queueRow?.sent_at ?? null,
      approval_status: item.approval_status ?? 'PENDING',
      approval_rejection_reason: item.rejection_reason ?? null,
      can_remove_approval:
        item.approval_status === 'APPROVED' &&
        queueRow?.status !== 'sent' &&
        !item.email_id,
      queue_counts: queueCounts,
    } satisfies PostEmail;
  });

  const summary = {
    queued: data.filter((item) => item.queue_status === 'queued').length,
    processing: data.filter((item) => item.queue_status === 'processing')
      .length,
    sent: data.filter((item) => item.queue_status === 'sent').length,
    failed: data.filter((item) => item.queue_status === 'failed').length,
    blocked: data.filter((item) => item.queue_status === 'blocked').length,
    cancelled: data.filter((item) => item.queue_status === 'cancelled').length,
    skipped: data.filter((item) => item.queue_status === 'skipped').length,
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
