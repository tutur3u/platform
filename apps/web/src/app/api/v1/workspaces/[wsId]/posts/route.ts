import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import type { PostEmail } from '@/app/[locale]/(dashboard)/[wsId]/posts/types';
import {
  getPostEmailQueueRows,
  summarizePostEmailQueue,
} from '@/lib/post-email-queue';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;

  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';
  const includedGroups = searchParams.getAll('includedGroups');
  const excludedGroups = searchParams.getAll('excludedGroups');
  const userId = searchParams.get('userId') || undefined;

  const sbAdmin = await createAdminClient();

  const hasFilters =
    includedGroups.length > 0 || excludedGroups.length > 0 || !!userId;

  const queryBuilder = sbAdmin
    .from('user_group_post_checks')
    .select(
      `post_id, notes, user_id, email_id, is_completed, approval_status, rejection_reason, user:workspace_users!user_id!inner(email, display_name, full_name, ws_id), user_group_posts${hasFilters ? '!inner' : ''}(id, title, content, group_id, workspace_user_groups(id, name)), sent_emails(subject)`,
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (includedGroups.length > 0) {
    queryBuilder.in('user_group_posts.group_id', includedGroups);
  }
  if (excludedGroups.length > 0) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }
  if (userId) {
    queryBuilder.eq('user_id', userId);
  }
  if (page && pageSize) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = start + parsedSize - 1;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const postIds = [
    ...new Set(rows.map((item: any) => item.post_id).filter(Boolean)),
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

  return NextResponse.json({
    data: rows.map((item: any) => {
      const queueRow = queueByPostAndUser.get(
        `${item.post_id}:${item.user_id}`
      );
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
      };
    }),
    count: count || 0,
  } as { data: PostEmail[]; count: number });
}
