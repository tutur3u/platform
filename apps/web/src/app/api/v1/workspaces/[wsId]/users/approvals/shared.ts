import type { Database } from '@tuturuuu/types';
import { z } from 'zod';
import { MAX_APPROVAL_REJECTION_REASON_LENGTH } from '@/features/reports/report-limits';

export type ApprovalStatus = Database['public']['Enums']['approval_status'];

export type PostApprovalRow = {
  post_id: string;
  user_id: string;
  notes: string | null;
  is_completed: boolean | null;
  approval_status: ApprovalStatus | null;
  rejection_reason: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  approved_by: string | null;
  post: {
    id: string;
    title: string | null;
    content: string | null;
    notes: string | null;
    created_at: string | null;
    updated_by: string | null;
    group_id: string | null;
    modifier: {
      display_name: string | null;
      full_name: string | null;
      email: string | null;
    } | null;
    workspace_user_groups: {
      name: string | null;
      ws_id: string | null;
    } | null;
  } | null;
  user: {
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
};

export type PostApprovalCheckWithGroup = {
  post_id: string;
  user_id: string;
  approval_status?: ApprovalStatus | null;
  user_group_posts: {
    group_id?: string | null;
  } | null;
};

export function buildPostApprovalItemId(postId: string, userId: string) {
  return `${postId}:${userId}`;
}

export function parsePostApprovalItemId(itemId: string) {
  const [postId, userId] = itemId.split(':');
  if (!postId || !userId) {
    return null;
  }

  return { postId, userId };
}

export const SearchParamsSchema = z.object({
  kind: z.enum(['reports', 'posts']),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  groupId: z.string().optional(),
  userId: z.string().optional(),
  creatorId: z.string().optional(),
});

export const MutationSchema = z.object({
  action: z.enum(['approve', 'reject', 'approveAll', 'unapprove']),
  kind: z.enum(['reports', 'posts']),
  itemId: z.string().optional(),
  reason: z.string().max(MAX_APPROVAL_REJECTION_REASON_LENGTH).optional(),
  filters: z
    .object({
      groupId: z.string().optional(),
      userId: z.string().optional(),
      creatorId: z.string().optional(),
    })
    .optional(),
});

export interface Params {
  params: Promise<{
    wsId: string;
  }>;
}
