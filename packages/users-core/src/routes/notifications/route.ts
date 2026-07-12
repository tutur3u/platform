import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
} from '@tuturuuu/users-core/lib/notifications/access';
import { resolveNotificationRouteUser } from '@tuturuuu/users-core/lib/notifications/route-auth';
import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  wsId: z
    .string()
    .guid()
    .nullable()
    .optional()
    .transform((value) => value || undefined),
  scope: z
    .enum(['user', 'workspace', 'system'])
    .nullable()
    .optional()
    .transform((value) => value || undefined),
  limit: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 20)),
  offset: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : 0)),
  unreadOnly: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value === 'true'),
  readOnly: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value === 'true'),
  type: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value || undefined),
  priority: z
    .enum(['low', 'medium', 'high', 'urgent'])
    .nullable()
    .optional()
    .transform((value) => value || undefined),
});

const bulkUpdateSchema = z.object({
  wsId: z
    .string()
    .guid()
    .nullable()
    .optional()
    .transform((value) => value || undefined),
  scope: z
    .enum(['user', 'workspace', 'system'])
    .nullable()
    .optional()
    .transform((value) => value || undefined),
  action: z.enum(['mark_all_read', 'mark_all_unread']),
});

async function getContext(request: Request) {
  const user = await resolveNotificationRouteUser(request);
  if (!user) return null;
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const access = await getNotificationAccessContext(admin, user);
  return { access, admin };
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      wsId: searchParams.get('wsId'),
      scope: searchParams.get('scope'),
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
      unreadOnly: searchParams.get('unreadOnly'),
      readOnly: searchParams.get('readOnly'),
      type: searchParams.get('type'),
      priority: searchParams.get('priority'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { wsId, scope, limit, offset, unreadOnly, readOnly, type, priority } =
      parsed.data;
    let query = context.admin
      .from('notifications')
      .select(
        '*, workspace:workspaces(name), actor:users!notifications_created_by_fkey(id, display_name, avatar_url)',
        { count: 'exact' }
      )
      .or(buildNotificationAccessFilter(context.access));

    if (wsId) query = query.eq('ws_id', wsId);
    if (scope) query = query.eq('scope', scope);
    if (unreadOnly) query = query.is('read_at', null);
    else if (readOnly) query = query.not('read_at', 'is', null) as typeof query;
    if (type) query = query.eq('type', type as never);
    if (priority) query = query.eq('priority', priority);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      console.error('Error fetching notifications', { error });
      return NextResponse.json(
        { error: 'Failed to fetch notifications' },
        { status: 500 }
      );
    }

    const notifications = (data ?? []).map((notification) => {
      const workspaceInviteWorkspaceId =
        notification.type === 'workspace_invite'
          ? [
              (notification.data as Record<string, unknown> | null)
                ?.workspace_id,
              notification.entity_id,
              notification.ws_id,
            ].find(
              (candidate): candidate is string =>
                typeof candidate === 'string' && candidate.length > 0
            )
          : null;

      return {
        ...notification,
        data: {
          ...(notification.data as Record<string, unknown> | null),
          ...(workspaceInviteWorkspaceId
            ? { workspace_id: workspaceInviteWorkspaceId }
            : {}),
          workspace_name:
            (notification.workspace as { name?: string } | null)?.name ||
            (notification.data as Record<string, unknown> | null)
              ?.workspace_name,
        },
        workspace: undefined,
      };
    });

    return NextResponse.json({
      notifications,
      count: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error in notifications API', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = bulkUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { wsId, scope, action } = parsed.data;
    let query = context.admin
      .from('notifications')
      .update(
        action === 'mark_all_read'
          ? { read_at: new Date().toISOString() }
          : { read_at: null }
      )
      .or(buildNotificationAccessFilter(context.access));
    if (wsId) query = query.eq('ws_id', wsId);
    if (scope) query = query.eq('scope', scope);
    query =
      action === 'mark_all_read'
        ? query.is('read_at', null)
        : (query.not('read_at', 'is', null) as typeof query);

    const { error } = await query;
    if (error) {
      console.error('Error updating notifications', { error });
      return NextResponse.json(
        { error: 'Failed to update notifications' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error in bulk notifications update', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
