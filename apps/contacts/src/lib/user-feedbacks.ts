import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { z } from 'zod';
import { getContactsWorkspaceAccess } from './workspace';

const feedbackSchema = z.object({
  content: z.string().trim().min(1),
  require_attention: z.boolean().default(false),
});
const createSchema = feedbackSchema.extend({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
});
const listSchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  requireAttention: z.enum(['all', 'true', 'false']).default('all'),
  groupId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  creatorId: z.string().uuid().optional(),
});
const historySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export interface FeedbackScope {
  wsId: string;
  groupId?: string;
  userId?: string;
}

function jsonError(message: string, status: number, issues?: unknown) {
  return Response.json(issues ? { message, issues } : { message }, { status });
}

async function authorize(wsId: string, manage: boolean) {
  const access = await getContactsWorkspaceAccess(wsId);
  if (!access) return { response: jsonError('Not found', 404) };
  const permission = manage ? 'update_user_groups_scores' : 'view_user_groups';
  if (!access.permissions.containsPermission(permission)) {
    return {
      response: jsonError(
        manage
          ? 'Insufficient permissions to manage feedback'
          : 'Insufficient permissions to view feedback',
        403
      ),
    };
  }
  return { access };
}

function displayName(
  user: {
    full_name: string | null;
    display_name: string | null;
  } | null
) {
  return (
    user?.full_name?.trim() || user?.display_name?.trim() || 'Unknown User'
  );
}

type RelatedUser = {
  id: string | null;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  ws_id?: string | null;
};

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeFeedback(row: {
  id: string;
  user_id: string | null;
  group_id: string | null;
  creator_id: string | null;
  content: string;
  require_attention: boolean;
  created_at: string;
  user: RelatedUser | RelatedUser[] | null;
  creator: RelatedUser | RelatedUser[] | null;
  group:
    | { id: string; name: string | null }
    | { id: string; name: string | null }[]
    | null;
}) {
  const user = first(row.user);
  const creator = first(row.creator);
  const group = first(row.group);
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    group_id: row.group_id ?? '',
    creator_id: row.creator_id,
    content: row.content,
    require_attention: row.require_attention,
    created_at: row.created_at,
    user: user
      ? {
          id: user.id,
          full_name: user.full_name,
          display_name: user.display_name,
          email: user.email,
        }
      : null,
    creator: creator
      ? {
          id: creator.id,
          full_name: creator.full_name,
          display_name: creator.display_name,
          email: creator.email,
        }
      : null,
    group,
    user_name: displayName(user),
    creator_name: displayName(creator),
    group_name: group?.name?.trim() || 'Unknown Group',
  };
}

function feedbackQuery(sbAdmin: TypedSupabaseClient, wsId: string) {
  return sbAdmin
    .from('user_feedbacks')
    .select(
      `id, user_id, group_id, creator_id, content, require_attention, created_at,
       user:workspace_users!user_feedbacks_user_id_fkey!inner(id, ws_id, full_name, display_name, email),
       creator:workspace_users!user_feedbacks_creator_id_fkey(id, full_name, display_name, email),
       group:workspace_user_groups!user_feedbacks_group_id_fkey(id, name)`,
      { count: 'exact' }
    )
    .eq('user.ws_id', wsId);
}

function databaseError(message: string, error: unknown, scope: FeedbackScope) {
  console.error(message, scope, error);
  return jsonError(message, 500);
}

export async function listFeedbacks(request: Request, scope: FeedbackScope) {
  const auth = await authorize(scope.wsId, false);
  if (auth.response) return auth.response;

  const params = Object.fromEntries(
    new URL(request.url).searchParams.entries()
  );
  const sbAdmin = await createAdminClient({ noCookie: true });

  if (scope.groupId && scope.userId) {
    const parsed = historySchema.safeParse(params);
    if (!parsed.success)
      return jsonError('Invalid query parameters', 400, parsed.error.issues);

    const { offset, limit } = parsed.data;
    const { data, error, count } = await feedbackQuery(sbAdmin, scope.wsId)
      .eq('group_id', scope.groupId)
      .eq('user_id', scope.userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return databaseError('Error fetching feedbacks', error, scope);
    return Response.json({
      data: (data ?? []).map(normalizeFeedback),
      count: count ?? 0,
      hasMore: (count ?? 0) > offset + limit,
    });
  }

  const parsed = listSchema.safeParse(params);
  if (!parsed.success)
    return jsonError('Invalid query parameters', 400, parsed.error.issues);
  const { q, page, pageSize, requireAttention, groupId, userId, creatorId } =
    parsed.data;
  let query = feedbackQuery(sbAdmin, scope.wsId);
  if (groupId) query = query.eq('group_id', groupId);
  if (userId) query = query.eq('user_id', userId);
  if (creatorId) query = query.eq('creator_id', creatorId);
  if (requireAttention !== 'all') {
    query = query.eq('require_attention', requireAttention === 'true');
  }
  if (q) {
    const escaped = q.replaceAll('%', '\\%').replaceAll(',', '\\,');
    query = query.or(
      `content.ilike.%${escaped}%,user.full_name.ilike.%${escaped}%,user.display_name.ilike.%${escaped}%,creator.full_name.ilike.%${escaped}%,creator.display_name.ilike.%${escaped}%,group.name.ilike.%${escaped}%`
    );
  }
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return databaseError('Error fetching feedbacks', error, scope);
  return Response.json({
    data: (data ?? []).map(normalizeFeedback),
    count: count ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
  });
}

export async function createFeedback(request: Request, scope: FeedbackScope) {
  const auth = await authorize(scope.wsId, true);
  if (auth.response) return auth.response;

  const parsed = createSchema.safeParse({
    ...(await request.json()),
    ...(scope.groupId ? { groupId: scope.groupId } : {}),
    ...(scope.userId ? { userId: scope.userId } : {}),
  });
  if (!parsed.success)
    return jsonError('Invalid request body', 400, parsed.error.issues);

  const { userId, groupId, content, require_attention } = parsed.data;
  const sbAdmin = await createAdminClient({ noCookie: true });
  const [{ data: targetUser }, { data: group }] = await Promise.all([
    sbAdmin
      .from('workspace_users')
      .select('id')
      .eq('id', userId)
      .eq('ws_id', scope.wsId)
      .maybeSingle(),
    sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', groupId)
      .eq('ws_id', scope.wsId)
      .maybeSingle(),
  ]);
  if (!targetUser || !group)
    return jsonError('User or group not found in workspace', 404);

  const { error } = await sbAdmin.from('user_feedbacks').insert({
    user_id: userId,
    group_id: groupId,
    content,
    require_attention,
    creator_id: auth.access.user.virtual_user_id,
  });
  if (error) return databaseError('Error creating feedback', error, scope);
  return Response.json({ message: 'success' });
}

export async function changeFeedback(
  request: Request,
  scope: FeedbackScope,
  method: 'PUT' | 'DELETE'
) {
  const auth = await authorize(scope.wsId, true);
  if (auth.response) return auth.response;

  const feedbackId = new URL(request.url).searchParams.get('feedbackId');
  if (!feedbackId) return jsonError('Feedback ID is required', 400);
  const parsed =
    method === 'PUT' ? feedbackSchema.safeParse(await request.json()) : null;
  if (parsed && !parsed.success)
    return jsonError('Invalid request body', 400, parsed.error.issues);

  const sbAdmin = await createAdminClient({ noCookie: true });
  let lookup = sbAdmin
    .from('user_feedbacks')
    .select('id, user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)')
    .eq('id', feedbackId)
    .eq('user.ws_id', scope.wsId);
  if (scope.groupId) lookup = lookup.eq('group_id', scope.groupId);
  if (scope.userId) lookup = lookup.eq('user_id', scope.userId);
  const { data: existing, error: lookupError } = await lookup.maybeSingle();
  if (lookupError || !existing) return jsonError('Feedback not found', 404);

  const { error } =
    method === 'PUT' && parsed?.success
      ? await sbAdmin
          .from('user_feedbacks')
          .update(parsed.data)
          .eq('id', feedbackId)
      : await sbAdmin.from('user_feedbacks').delete().eq('id', feedbackId);
  if (error)
    return databaseError(
      `Error ${method === 'PUT' ? 'updating' : 'deleting'} feedback`,
      error,
      scope
    );
  return Response.json({ message: 'success' });
}
