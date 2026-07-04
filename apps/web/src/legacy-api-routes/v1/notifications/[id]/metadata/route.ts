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
} from '../../access';

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

    const { data: notification, error: fetchError } = await sbAdmin
      .from('notifications')
      .select('id, data')
      .eq('id', id)
      .or(accessFilter)
      .maybeSingle();

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

    // Merge new metadata with existing data
    const updatedData = {
      ...(typeof notification.data === 'object' && notification.data !== null
        ? (notification.data as Record<string, unknown>)
        : {}),
      ...validatedMetadata.data,
    } as Record<string, unknown>;

    const { data: updatedNotification, error: updateError } = await sbAdmin
      .from('notifications')
      .update({ data: updatedData as any })
      .eq('id', id)
      .or(accessFilter)
      .select('id')
      .maybeSingle();

    if (updateError) {
      console.error('Error updating notification metadata:', updateError);
      return NextResponse.json(
        { error: 'Failed to update notification metadata' },
        { status: 500 }
      );
    }

    if (!updatedNotification) {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
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
