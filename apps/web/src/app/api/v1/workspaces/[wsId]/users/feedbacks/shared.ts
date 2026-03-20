import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { getWorkspaceUserDisplayName } from '@/lib/user-feedbacks';

export const FeedbackContentSchema = z.object({
  content: z.string().trim().min(1),
  require_attention: z.boolean().default(false),
});

export const CreateWorkspaceFeedbackSchema = FeedbackContentSchema.extend({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
});

export const FeedbackListSearchParamsSchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  requireAttention: z.enum(['all', 'true', 'false']).default('all'),
  groupId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  creatorId: z.string().uuid().optional(),
});

type FeedbackUserRow =
  | {
      id: string | null;
      full_name: string | null;
      display_name: string | null;
      email: string | null;
      ws_id?: string | null;
    }
  | {
      id: string | null;
      full_name: string | null;
      display_name: string | null;
      email: string | null;
      ws_id?: string | null;
    }[]
  | null;

type FeedbackGroupRow =
  | {
      id: string;
      name: string | null;
    }
  | {
      id: string;
      name: string | null;
    }[]
  | null;

function normalizeFeedbackUser(user: FeedbackUserRow) {
  const value = Array.isArray(user) ? (user[0] ?? null) : user;

  return value
    ? {
        id: value.id,
        full_name: value.full_name,
        display_name: value.display_name,
        email: value.email ?? null,
      }
    : null;
}

function normalizeFeedbackGroup(group: FeedbackGroupRow) {
  const value = Array.isArray(group) ? (group[0] ?? null) : group;

  return value
    ? {
        id: value.id,
        name: value.name,
      }
    : null;
}

export function normalizeWorkspaceFeedback(
  feedback: {
    id: string;
    user_id: string | null;
    group_id: string | null;
    creator_id: string | null;
    content: string;
    require_attention: boolean;
    created_at: string;
    user: FeedbackUserRow;
    creator: FeedbackUserRow;
    group: FeedbackGroupRow;
  } & Record<string, unknown>
) {
  const user = normalizeFeedbackUser(feedback.user);
  const creator = normalizeFeedbackUser(feedback.creator);
  const group = normalizeFeedbackGroup(feedback.group);

  return {
    id: feedback.id,
    user_id: feedback.user_id ?? '',
    group_id: feedback.group_id ?? '',
    creator_id: feedback.creator_id,
    content: feedback.content,
    require_attention: feedback.require_attention,
    created_at: feedback.created_at,
    user,
    creator,
    group,
    user_name: getWorkspaceUserDisplayName(user ?? undefined),
    creator_name: getWorkspaceUserDisplayName(creator ?? undefined),
    group_name: group?.name?.trim() || 'Unknown Group',
  };
}

export async function buildWorkspaceFeedbacksQuery(
  sbAdmin: TypedSupabaseClient,
  {
    wsId,
    q,
    page,
    pageSize,
    requireAttention,
    groupId,
    userId,
    creatorId,
  }: {
    wsId: string;
    q?: string;
    page: number;
    pageSize: number;
    requireAttention: 'all' | 'true' | 'false';
    groupId?: string;
    userId?: string;
    creatorId?: string;
  }
) {
  let query = sbAdmin
    .from('user_feedbacks')
    .select(
      `
        id,
        user_id,
        group_id,
        creator_id,
        content,
        require_attention,
        created_at,
        user:workspace_users!user_feedbacks_user_id_fkey!inner(
          id,
          ws_id,
          full_name,
          display_name,
          email
        ),
        creator:workspace_users!user_feedbacks_creator_id_fkey(
          id,
          full_name,
          display_name,
          email
        ),
        group:workspace_user_groups!user_feedbacks_group_id_fkey(
          id,
          name
        )
      `,
      { count: 'exact' }
    )
    .eq('user.ws_id', wsId);

  if (groupId) {
    query = query.eq('group_id', groupId);
  }

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (creatorId) {
    query = query.eq('creator_id', creatorId);
  }

  if (requireAttention !== 'all') {
    query = query.eq('require_attention', requireAttention === 'true');
  }

  if (q) {
    const escaped = q.replaceAll('%', '\\%').replaceAll(',', '\\,');
    query = query.or(
      [
        `content.ilike.%${escaped}%`,
        `user.full_name.ilike.%${escaped}%`,
        `user.display_name.ilike.%${escaped}%`,
        `creator.full_name.ilike.%${escaped}%`,
        `creator.display_name.ilike.%${escaped}%`,
        `group.name.ilike.%${escaped}%`,
      ].join(',')
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  return query.order('created_at', { ascending: false }).range(from, to);
}
