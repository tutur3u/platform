import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Verify notification belongs to user
    // RLS policies handle access control (user_id OR email match)
    const { data: notification } = await supabase
      .from('notifications')
      .select('id, ws_id, user_id, email')
      .eq('id', id)
      .single();

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Additional verification: check both user_id and email
    // Get email from auth.users (more reliable)
    const { data: authUser } = await supabase.auth.getUser();
    let userEmail = authUser.user?.email;

    // Fallback: try from user_private_details
    if (!userEmail) {
      const { data: currentUserData } = await supabase
        .from('users')
        .select('email:user_private_details(email)')
        .eq('id', user.id)
        .single();

      userEmail = (currentUserData?.email as any)?.[0]?.email;
    }

    const userIdMatches = notification.user_id === user.id;
    const emailMatches =
      notification.email &&
      userEmail &&
      notification.email.toLowerCase() === userEmail.toLowerCase();
    const belongsToUser = userIdMatches || emailMatches;

    if (!belongsToUser) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update notification (RLS policies handle final access control)
    const update = read
      ? { read_at: new Date().toISOString() }
      : { read_at: null };

    const { error } = await supabase
      .from('notifications')
      .update(update)
      .eq('id', id);

    if (error) {
      console.error('Error updating notification:', error);
      return NextResponse.json(
        { error: 'Failed to update notification' },
        { status: 500 }
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
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify notification belongs to user
    // RLS policies handle access control (user_id OR email match)
    const { data: notification } = await supabase
      .from('notifications')
      .select('id, user_id, email')
      .eq('id', id)
      .single();

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Additional verification: check both user_id and email
    // Get email from auth.users (more reliable)
    const { data: authUser } = await supabase.auth.getUser();
    let userEmail = authUser.user?.email;

    // Fallback: try from user_private_details
    if (!userEmail) {
      const { data: currentUserData } = await supabase
        .from('users')
        .select('email:user_private_details(email)')
        .eq('id', user.id)
        .single();

      userEmail = (currentUserData?.email as any)?.[0]?.email;
    }

    const userIdMatches = notification.user_id === user.id;
    const emailMatches =
      notification.email &&
      userEmail &&
      notification.email.toLowerCase() === userEmail.toLowerCase();
    const belongsToUser = userIdMatches || emailMatches;

    if (!belongsToUser) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete notification (RLS policies handle final access control)
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting notification:', error);
      return NextResponse.json(
        { error: 'Failed to delete notification' },
        { status: 500 }
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
