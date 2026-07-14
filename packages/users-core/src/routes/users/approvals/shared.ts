import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { z } from 'zod';
import { MAX_APPROVAL_REJECTION_REASON_LENGTH } from '../../../features/reports/report-limits';

export type ApprovalStatus = Database['public']['Enums']['approval_status'];

export interface ApprovalRouteActor {
  email?: string | null;
  id: string;
}

export interface ApprovalRouteParams {
  params: Promise<{ wsId: string }>;
}

export type PostApprovalCheckWithGroup = {
  approval_status?: ApprovalStatus | null;
  post_id: string;
  user_group_posts: { group_id?: string | null } | null;
  user_id: string;
};

export type PostApprovalQueueRow = {
  post_id: string;
  status: string;
  user_id: string;
};

export type PostApprovalRow = {
  approval_status: ApprovalStatus | null;
  approved_at: string | null;
  approved_by: string | null;
  is_completed: boolean | null;
  notes: string | null;
  post: {
    content: string | null;
    created_at: string | null;
    group_id: string | null;
    id: string;
    modifier: {
      display_name: string | null;
      email: string | null;
      full_name: string | null;
    } | null;
    notes: string | null;
    title: string | null;
    updated_by: string | null;
    workspace_user_groups: { name: string | null; ws_id: string | null } | null;
  } | null;
  post_id: string;
  rejected_at: string | null;
  rejection_reason: string | null;
  user: {
    display_name: string | null;
    email: string | null;
    full_name: string | null;
  } | null;
  user_id: string;
};

export const ApprovalSearchParamsSchema = z.object({
  creatorId: z.string().optional(),
  groupId: z.string().optional(),
  kind: z.enum(['reports', 'posts']),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  page: z.coerce.number().int().min(1).default(1),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).default('all'),
  userId: z.string().optional(),
});

export const ApprovalMutationSchema = z.object({
  action: z.enum(['approve', 'reject', 'approveAll', 'unapprove']),
  filters: z
    .object({
      creatorId: z.string().optional(),
      groupId: z.string().optional(),
      userId: z.string().optional(),
    })
    .optional(),
  itemId: z.string().optional(),
  kind: z.enum(['reports', 'posts']),
  reason: z.string().max(MAX_APPROVAL_REJECTION_REASON_LENGTH).optional(),
});

export function buildPostApprovalItemId(postId: string, userId: string) {
  return `${postId}:${userId}`;
}

export function parsePostApprovalItemId(itemId: string) {
  const [postId, userId] = itemId.split(':');
  return postId && userId ? { postId, userId } : null;
}

export function summarizePostEmailQueue(rows: PostApprovalQueueRow[]) {
  return rows.reduce(
    (summary, row) => {
      if (row.status in summary) {
        summary[row.status as keyof typeof summary] += 1;
      }
      return summary;
    },
    {
      blocked: 0,
      cancelled: 0,
      failed: 0,
      processing: 0,
      queued: 0,
      sent: 0,
      skipped: 0,
    }
  );
}

export async function cancelQueuedPostEmails(
  sbAdmin: TypedSupabaseClient,
  postId: string,
  userIds: string[]
) {
  const { error } = await sbAdmin
    .from('post_email_queue')
    .update({
      batch_id: null,
      cancelled_at: new Date().toISOString(),
      claimed_at: null,
      status: 'cancelled',
    })
    .eq('post_id', postId)
    .in('status', ['queued', 'processing', 'failed', 'blocked'])
    .in('user_id', userIds);

  if (error) throw error;
}

export async function hasPostEmailBeenSent(
  sbAdmin: TypedSupabaseClient,
  postId: string,
  userId: string
) {
  const [
    { data: sentEmail, error: sentError },
    { data: queue, error: queueError },
  ] = await Promise.all([
    sbAdmin
      .from('sent_emails')
      .select('id')
      .eq('post_id', postId)
      .eq('receiver_id', userId)
      .limit(1)
      .maybeSingle(),
    sbAdmin
      .from('post_email_queue')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle(),
  ]);

  if (sentError) throw sentError;
  if (queueError) throw queueError;
  return Boolean(sentEmail || queue);
}
