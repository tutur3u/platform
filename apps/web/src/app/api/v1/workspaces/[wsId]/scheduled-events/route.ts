import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';

// type EventAttendeeWithUser = {
//   id: string;
//   user_id: string | null;
//   status: Database['public']['Enums']['event_attendee_status'] | null;
//   response_at: string | null;
//   user: {
//     id: string;
//     display_name: string | null;
//     avatar_url: string | null;
//   } | null;
// };

// type WorkspaceScheduledEventWithAttendees =
//   Database['public']['Tables']['workspace_scheduled_events']['Row'] & {
//     attendees?: EventAttendeeWithUser[];
//     creator: Database['public']['Tables']['users']['Row'];
//   };

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

// GET /api/v1/workspaces/[wsId]/scheduled-events
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
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

    // Get events where user is either creator or attendee
    const { data: events, error } = await supabase
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
      .eq('ws_id', wsId)
      .or(`creator_id.eq.${user.id},attendees.user_id.eq.${user.id}`)
      .order('start_at', { ascending: true });

    if (error) {
      console.error('Error fetching scheduled events:', error);
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      );
    }

    // Calculate attendee counts for each event
    const eventsWithCounts =
      events?.map((event) => ({
        ...event,
        attendee_count: {
          total: event.attendees?.length || 0,
          accepted:
            event.attendees?.filter((a) => a.status === 'accepted').length || 0,
          declined:
            event.attendees?.filter((a) => a.status === 'declined').length || 0,
          pending:
            event.attendees?.filter((a) => a.status === 'pending').length || 0,
          tentative:
            event.attendees?.filter((a) => a.status === 'tentative').length ||
            0,
        },
      })) || [];

    return NextResponse.json(eventsWithCounts);
  } catch (error) {
    console.error('Error in scheduled-events GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/v1/workspaces/[wsId]/scheduled-events
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;
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
    const {
      title,
      description,
      start_at,
      end_at,
      location,
      color,
      is_all_day,
      requires_confirmation,
      status,
      attendee_ids,
    } = body;

    // Validate required fields
    if (
      !title ||
      !start_at ||
      !end_at ||
      !attendee_ids ||
      attendee_ids.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: title, start_at, end_at, attendee_ids',
        },
        { status: 400 }
      );
    }

    // Create the event
    const { data: event, error: eventError } = await supabase
      .from('workspace_scheduled_events')
      .insert({
        ws_id: wsId,
        title,
        description,
        start_at,
        end_at,
        location,
        color,
        creator_id: user.id,
        is_all_day: is_all_day || false,
        requires_confirmation: requires_confirmation !== false,
        status: status || 'active',
      })
      .select()
      .single();

    if (eventError) {
      console.error('Error creating event:', eventError);
      return NextResponse.json(
        { error: 'Failed to create event' },
        { status: 500 }
      );
    }

    // Create attendee records
    const attendeeRecords = attendee_ids.map((userId: string) => ({
      event_id: event.id,
      user_id: userId,
      status: 'pending',
    }));

    const { error: attendeeError } = await supabase
      .from('event_attendees')
      .insert(attendeeRecords);

    if (attendeeError) {
      console.error('Error creating attendees:', attendeeError);
      // Clean up the event if attendees failed
      await supabase
        .from('workspace_scheduled_events')
        .delete()
        .eq('id', event.id);
      return NextResponse.json(
        { error: 'Failed to create event attendees' },
        { status: 500 }
      );
    }

    // TODO: Send email notifications to attendees
    // This would be implemented with your email service

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('Error in scheduled-events POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
