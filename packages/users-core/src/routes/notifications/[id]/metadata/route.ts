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

const metadataSchema = z
  .object({
    action_taken: z.enum(['accepted', 'declined']).optional(),
    action_timestamp: z.string().datetime().optional(),
  })
  .catchall(z.unknown());

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await resolveNotificationRouteUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = metadataSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid metadata', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { id } = await params;
    const admin = (await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient;
    const access = await getNotificationAccessContext(admin, user);
    const filter = buildNotificationAccessFilter(access);
    const { data: notification, error: fetchError } = await admin
      .from('notifications')
      .select('id, data')
      .eq('id', id)
      .or(filter)
      .maybeSingle();

    if (fetchError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    const updatedData = {
      ...(typeof notification.data === 'object' && notification.data !== null
        ? (notification.data as Record<string, unknown>)
        : {}),
      ...parsed.data,
    };
    const { data, error } = await admin
      .from('notifications')
      .update({ data: updatedData as never })
      .eq('id', id)
      .or(filter)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error updating notification metadata', { error, id });
      return NextResponse.json(
        { error: 'Failed to update notification metadata' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updatedData });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error in notification metadata update', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
