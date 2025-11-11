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
    const { data: notification, error: fetchError } = await supabase
      .from('notifications')
      .select('id, user_id, data')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !notification) {
      return NextResponse.json(
        { error: 'Notification not found or access denied' },
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
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ data: updatedData as any })
      .eq('id', id)
      .eq('user_id', user.id);

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
