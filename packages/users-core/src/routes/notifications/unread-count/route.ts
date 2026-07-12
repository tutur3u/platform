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
});

export async function GET(request: Request) {
  try {
    const user = await resolveNotificationRouteUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = querySchema.safeParse({
      wsId: new URL(request.url).searchParams.get('wsId'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const admin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    const { wsId } = parsed.data;
    if (wsId) {
      const { data: membership, error } = await admin
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error checking workspace membership', { error, wsId });
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }
      if (!membership) {
        return NextResponse.json(
          { error: 'Access denied to workspace' },
          { status: 403 }
        );
      }
    }

    const access = await getNotificationAccessContext(admin, user);
    let query = admin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .or(buildNotificationAccessFilter(access))
      .is('read_at', null);
    if (wsId) query = query.eq('ws_id', wsId);

    const { count, error } = await query;
    if (error) {
      console.error('Error fetching unread notification count', { error });
      return NextResponse.json(
        { error: 'Failed to fetch unread count' },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error in unread notification count API', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
