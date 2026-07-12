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

const updateSchema = z.object({ read: z.boolean() });
type Params = { params: Promise<{ id: string }> };

async function getContext(request: Request) {
  const user = await resolveNotificationRouteUser(request);
  if (!user) return null;
  const admin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const access = await getNotificationAccessContext(admin, user);
  return { admin, filter: buildNotificationAccessFilter(access) };
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const context = await getContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { id } = await params;
    const { data, error } = await context.admin
      .from('notifications')
      .update({
        read_at: parsed.data.read ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .or(context.filter)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error updating notification', { error, id });
      return NextResponse.json(
        { error: 'Failed to update notification' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error in notification update', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const context = await getContext(request);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { data, error } = await context.admin
      .from('notifications')
      .delete()
      .eq('id', id)
      .or(context.filter)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error deleting notification', { error, id });
      return NextResponse.json(
        { error: 'Failed to delete notification' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error in notification deletion', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
