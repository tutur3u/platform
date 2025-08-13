import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';

type EventAttendeeCount = {
  total: number;
  accepted: number;
  declined: number;
  pending: number;
  tentative: number;
};

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

// GET /api/v1/workspaces/[wsId]/scheduled-events/invitations
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

    // Get all events where the user is an attendee
    const { data: attendeeRecords, error } = await supabase
      .from('event_attendees')
      .select(
        `
        id,
        user_id,
        status,
        response_at,
        created_at,
        updated_at,
        event:workspace_scheduled_events(
          id,
          ws_id,
          title,
          description,
          start_at,
          end_at,
          location,
          color,
          creator_id,
          is_all_day,
          requires_confirmation,
          status,
          created_at,
          updated_at,
          creator:users!creator_id(id, display_name, avatar_url)
        )
      `
      )
      .eq('user_id', user.id)
      .eq('event.ws_id', wsId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invitations:', error);
      return NextResponse.json(
        { error: 'Failed to fetch invitations' },
        { status: 500 }
      );
    }

    // Filter out records where event is null (in case event was deleted)
    const validInvitations =
      attendeeRecords?.filter((record) => record.event) || [];

    // For each event, get attendee counts
    const eventIds = validInvitations.map((inv) => inv.event.id);

    if (eventIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: allAttendees, error: attendeesError } = await supabase
      .from('event_attendees')
      .select('event_id, status')
      .in('event_id', eventIds);

    if (attendeesError) {
      console.error('Error fetching attendee counts:', attendeesError);
      return NextResponse.json(
        { error: 'Failed to fetch attendee information' },
        { status: 500 }
      );
    }

    // Calculate attendee counts for each event
    const attendeeCounts =
      allAttendees?.reduce(
        (acc, attendee) => {
          if (!acc[attendee.event_id]) {
            acc[attendee.event_id] = {
              total: 0,
              accepted: 0,
              declined: 0,
              pending: 0,
              tentative: 0,
            };
          }

          const eventCounts = acc[attendee.event_id];
          if (eventCounts) {
            eventCounts.total++;
            if (attendee.status) {
              eventCounts[attendee.status]++;
            }
          }

          return acc;
        },
        {} as Record<string, EventAttendeeCount>
      ) || {};

    // Transform the data to match the expected format
    const invitations = validInvitations.map((invitation) => ({
      event: {
        ...invitation.event,
        attendee_count: attendeeCounts[invitation.event.id] || {
          total: 0,
          accepted: 0,
          declined: 0,
          pending: 0,
          tentative: 0,
        },
      },
      attendee: {
        id: invitation.id,
        event_id: invitation.event.id,
        user_id: invitation.user_id,
        status: invitation.status,
        response_at: invitation.response_at,
        created_at: invitation.created_at,
        updated_at: invitation.updated_at,
      },
    }));

    return NextResponse.json(invitations);
  } catch (error) {
    console.error('Error in invitations GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
