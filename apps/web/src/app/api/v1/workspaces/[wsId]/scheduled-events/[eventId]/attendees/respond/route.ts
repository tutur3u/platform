import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    eventId: string;
  }>;
}

// PUT /api/v1/workspaces/[wsId]/scheduled-events/[eventId]/attendees/respond
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { wsId, eventId } = await params;
    const supabase = await createClient();
    const user = await getCurrentUser();

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

    const body = await req.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['pending', 'accepted', 'declined', 'tentative'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error:
            'Invalid status. Must be one of: pending, accepted, declined, tentative',
        },
        { status: 400 }
      );
    }

    // Verify the event belongs to the workspace
    const { data: event, error: eventError } = await supabase
      .from('workspace_scheduled_events')
      .select('id, ws_id')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Verify the user is an attendee for this event
    const { data: attendee, error: attendeeError } = await supabase
      .from('event_attendees')
      .select('id, event_id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .single();
    if (attendeeError || !attendee) {
      return NextResponse.json(
        { error: 'You are not invited to this event' },
        { status: 403 }
      );
    }

    // Update the attendee status
    const { data: updatedAttendee, error: updateError } = await supabase
      .from('event_attendees')
      .update({
        status,
        response_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', attendee.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating attendee status:', updateError);
      const code = (updateError as { code?: string })?.code;
      const status = code === '42501' ? 403 : 500; // 42501: permission denied (RLS)
      const msg =
        status === 403
          ? 'Not allowed to update this attendee'
          : 'Failed to update response';
      return NextResponse.json({ error: msg }, { status });
    }

    if (!updatedAttendee) {
      // Likely concurrent change or no matching row after filters
      return NextResponse.json(
        { error: 'Attendee update conflict; please refresh and retry' },
        { status: 409 }
      );
    }

    // If the user accepted the event, we might want to add it to their calendar
    // This would be handled by the calendar integration

    return NextResponse.json(updatedAttendee);
  } catch (error) {
    console.error('Error in attendees respond PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
