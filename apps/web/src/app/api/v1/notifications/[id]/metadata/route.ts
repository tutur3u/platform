import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const metadataSchema = z
  .object({
    action_taken: z.enum(['accepted', 'declined']).optional(),
    action_timestamp: z.string().datetime().optional(),
  })
  .passthrough(); // Allow additional fields

/**
 * PATCH /api/v1/notifications/[id]/metadata
 * Updates notification metadata (merges into the data JSONB field)
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

    // Validate notification ID
    if (!id) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      );
    }

    // Parse and validate body
    const body = await req.json();
    const validatedMetadata = metadataSchema.safeParse(body);

    if (!validatedMetadata.success) {
      return NextResponse.json(
        {
          error: 'Invalid metadata',
          details: validatedMetadata.error.issues,
        },
        { status: 400 }
      );
    }

    // Fetch the notification to verify ownership and get current data
    // Note: RLS policies handle access control (user_id OR email match)
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, email, data')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching notification:', fetchError);
      return NextResponse.json(
        {
          error: 'Notification not found or access denied',
          details: fetchError,
        },
        { status: 404 }
      );
    }

    if (!notification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      );
    }

    // Additional verification: ensure this notification belongs to current user
    // Check both user_id and email to handle email-based notifications

    // Try to get user email from auth.users (more reliable)
    const { data: authUser } = await supabase.auth.getUser();
    let userEmail = authUser.user?.email;

    // Fallback: try from user_private_details
    if (!userEmail) {
      const { data: currentUserData, error: userError } = await supabase
        .from('users')
        .select('email:user_private_details(email)')
        .eq('id', user.id)
        .single();

      if (userError) {
        console.error('Error fetching user email:', userError);
      }

      userEmail = (currentUserData?.email as any)?.[0]?.email;
    }

    // Check ownership: user_id matches OR email matches
    const userIdMatches = notification.user_id === user.id;
    const emailMatches =
      notification.email &&
      userEmail &&
      notification.email.toLowerCase() === userEmail.toLowerCase();
    const belongsToUser = userIdMatches || emailMatches;

    console.log('Metadata update ownership check:', {
      notification_id: notification.id,
      notification_user_id: notification.user_id,
      notification_email: notification.email,
      current_user_id: user.id,
      current_user_email: userEmail,
      userIdMatches,
      emailMatches,
      belongsToUser,
    });

    if (!belongsToUser) {
      return NextResponse.json(
        {
          error: 'Notification not found or access denied',
          debug: {
            notification_email: notification.email,
            your_email: userEmail,
            matches: emailMatches,
          },
        },
        { status: 404 }
      );
    }

    // Merge new metadata with existing data
    const updatedData = {
      ...(typeof notification.data === 'object' && notification.data !== null
        ? (notification.data as Record<string, unknown>)
        : {}),
      ...validatedMetadata.data,
    } as Record<string, unknown>;

    // Update the notification
    // RLS policies handle access control, we just need to match by id
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ data: updatedData as any })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating notification metadata:', updateError);
      return NextResponse.json(
        { error: 'Failed to update notification metadata' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updatedData });
  } catch (error) {
    console.error('Error in notification metadata update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
