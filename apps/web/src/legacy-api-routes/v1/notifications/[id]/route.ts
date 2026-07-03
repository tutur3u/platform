import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildNotificationAccessFilter,
  getNotificationAccessContext,
} from '../access';

const updateSchema = z.object({
  read: z.boolean(),
});

/**
 * PATCH /api/v1/notifications/[id]
 * Updates a single notification (mark as read/unread)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient(req);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessContext = await getNotificationAccessContext(supabase, user);
    const accessFilter = buildNotificationAccessFilter(accessContext);

    const { id } = await params;

    // Parse and validate body
    const body = await req.json();
    const validatedData = updateSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validatedData.error },
        { status: 400 }
      );
    }

    const { read } = validatedData.data;

    const { data: notification } = await sbAdmin
      .from('notifications')
      .select('id')
      .eq('id', id)
      .or(accessFilter)
      .maybeSingle();

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    const update = read
      ? { read_at: new Date().toISOString() }
      : { read_at: null };

    const { data: updatedNotification, error } = await sbAdmin
      .from('notifications')
      .update(update)
      .eq('id', id)
      .or(accessFilter)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error updating notification:', {
        error,
        notificationId: id,
        update,
      });
      return NextResponse.json(
        { error: 'Failed to update notification' },
        { status: 500 }
      );
    }

    if (!updatedNotification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in notification update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/notifications/[id]
 * Deletes a single notification
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient(req);
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accessContext = await getNotificationAccessContext(supabase, user);
    const accessFilter = buildNotificationAccessFilter(accessContext);

    const { id } = await params;

    const { data: notification } = await sbAdmin
      .from('notifications')
      .select('id')
      .eq('id', id)
      .or(accessFilter)
      .maybeSingle();

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }
    const { data: deletedNotification, error } = await sbAdmin
      .from('notifications')
      .delete()
      .eq('id', id)
      .or(accessFilter)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('Error deleting notification:', error);
      return NextResponse.json(
        { error: 'Failed to delete notification' },
        { status: 500 }
      );
    }

    if (!deletedNotification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in notification deletion:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
