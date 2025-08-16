import { createClient } from '@tuturuuu/supabase/next/server';
import { isValidUUID } from '@tuturuuu/utils/uuid-helper';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    eventId: string;
    userId: string;
  }>;
}

// DELETE /api/v1/workspaces/[wsId]/scheduled-events/[eventId]/attendees/[userId]
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { wsId, eventId, userId } = await params;

    if (!isValidUUID(wsId) || !isValidUUID(eventId) || !isValidUUID(userId)) {
      return NextResponse.json({ error: 'Invalid UUID' }, { status: 400 });
    }

    const supabase = await createClient();
    const user = await getCurrentUser(true);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { withoutPermission } = await getPermissions({ wsId });
    if (withoutPermission('manage_calendar')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check if user is the creator of the event
    const { data: existingEvent, error: checkError } = await supabase
      .from('workspace_scheduled_events')
      .select('creator_id')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (checkError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (existingEvent.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only event creators can manage attendees' },
        { status: 403 }
      );
    }

    if (existingEvent.creator_id === userId) {
      return NextResponse.json(
        { error: 'Event creator cannot be removed from their own event' },
        { status: 403 }
      );
    }

    // Remove the attendee
    const { error: deleteError } = await supabase
      .from('event_attendees')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error removing attendee:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove attendee' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Attendee removed successfully' });
  } catch (error) {
    console.error('Error in attendee DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
