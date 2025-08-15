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

// GET /api/v1/workspaces/[wsId]/scheduled-events/[eventId]
export async function GET(req: NextRequest, { params }: Params) {
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

    // Get event with full details
    const { data: event, error } = await supabase
      .from('workspace_scheduled_events')
      .select(
        `
        *,
        creator:users!creator_id(id, display_name, avatar_url),
        attendees:event_attendees(
          id,
          user_id,
          status,
          response_at,
          user:users(id, display_name, avatar_url)
        )
      `
      )
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (error) {
      console.error('Error fetching event:', error);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if user has access to this event (creator or attendee)
    const isCreator = event.creator_id === user.id;
    const isAttendee = event.attendees?.some(
      (a) => a.user_id === user.id
    );

    if (!isCreator && !isAttendee) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const counts = event.attendees?.reduce(
      (acc, attendee) => {
        acc.total++;
        if (attendee.status) {
          acc[attendee.status as keyof typeof acc]++;
        }
        return acc;
      },
      { total: 0, accepted: 0, declined: 0, pending: 0, tentative: 0 }
    ) || { total: 0, accepted: 0, declined: 0, pending: 0, tentative: 0 };
    const eventWithCounts = {
      ...event,
      attendee_count: counts,
    };

    return NextResponse.json(eventWithCounts);
  } catch (error) {
    console.error('Error in scheduled-events GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/v1/workspaces/[wsId]/scheduled-events/[eventId]
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
        { error: 'Only event creators can edit events' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      title,
      description,
      start_at,
      end_at,
      location,
      color,
      is_all_day,
      status,
    } = body;


    // Validate required fields
    if (!title || !start_at || !end_at) {
      return NextResponse.json(
        { error: 'Missing required fields: title, start_at, end_at' },
        { status: 400 }
      );
    }
    // Validate date consistency
    if (new Date(end_at) < new Date(start_at)) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      );
    }
    // Validate status if provided
    const validStatuses = ['active', 'cancelled', 'completed', 'draft'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status value' },
        { status: 400 }
      );
    }

    // Update the event
    const { data: updatedEvent, error: updateError } = await supabase
      .from('workspace_scheduled_events')
      .update({
        title,
        description,
        start_at,
        end_at,
        location,
        color,
        is_all_day,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating event:', updateError);
      return NextResponse.json(
        { error: 'Failed to update event' },
        { status: 500 }
      );
    }

    return NextResponse.json(updatedEvent);
  } catch (error) {
    console.error('Error in scheduled-events PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/workspaces/[wsId]/scheduled-events/[eventId]
export async function DELETE(req: NextRequest, { params }: Params) {
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
        { error: 'Only event creators can delete events' },
        { status: 403 }
      );
    }

    // Delete the event (attendees will be deleted via CASCADE)
    const { error: deleteError } = await supabase
      .from('workspace_scheduled_events')
      .delete()
      .eq('id', eventId);

    if (deleteError) {
      console.error('Error deleting event:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete event' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error in scheduled-events DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
