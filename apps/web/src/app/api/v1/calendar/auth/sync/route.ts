import type { CalendarEvent as BaseCalendarEvent } from '@tuturuuu/ai/calendar/events';
import { google, OAuth2Client } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import dayjs from 'dayjs';
import { NextResponse } from 'next/server';

interface CalendarEvent extends BaseCalendarEvent {
  id?: string; // Add the optional 'id' property
}

const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string;
}) => {
  const oauth2Client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

const getGoogleColorId = (color?: string): string => {
  const colorMap: Record<string, string> = {
    BLUE: '11',
    RED: '1',
    GREEN: '2',
    YELLOW: '5',
    ORANGE: '6',
    PURPLE: '9',
    PINK: '4',
    INDIGO: '10',
    CYAN: '8',
    GRAY: '3',
  };
  return color && colorMap[color] ? colorMap[color] : '11';
};

export async function POST(request: Request) {
  const body = await request.json();
  const { event }: { event: CalendarEvent } = body;

  const supabase = await createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  const { data: googleTokens, error: googleTokensError } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (googleTokensError) {
    return NextResponse.json(
      { error: 'Failed to fetch Google tokens' },
      { status: 500 }
    );
  }

  if (!googleTokens?.access_token) {
    // T0D0: Don't return error immediately, maybe user hasn't linked (fix in the future)
    return NextResponse.json(
      { error: 'Google Calendar not authenticated' },
      { status: 401 }
    );
  }

  try {
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    // Check if this is an all-day event to format it correctly for Google Calendar
    const isEventAllDay = isAllDayEvent(event);

    const googleEvent: any = {
      summary: event.title || 'Untitled Event',
      description: event.description || '',
      location: event.location || '',
      colorId: getGoogleColorId(event.color),
    };

    if (isEventAllDay) {
      // For all-day events, use date format (not dateTime)
      const startDate = dayjs(event.start_at).format('YYYY-MM-DD');
      const endDate = dayjs(event.end_at).format('YYYY-MM-DD');

      googleEvent.start = { date: startDate };
      googleEvent.end = { date: endDate };
    } else {
      // For timed events, use dateTime format
      googleEvent.start = {
        dateTime: event.start_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      googleEvent.end = {
        dateTime: event.end_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: googleEvent,
    });

    const googleEventId = response.data.id;

    if (googleEventId && event.id && event.id !== 'new') {
      // Ensure we have a local event ID
      // *** Update Supabase with the Google Event ID ***
      const { error: updateError } = await supabase
        .from('workspace_calendar_events')
        .update({ google_event_id: googleEventId })
        .eq('id', event.id); // Use the local event ID passed from frontend

      if (updateError) {
        console.error(
          'Failed to update Supabase with Google Event ID:',
          updateError
        );
        // Don't fail the whole request, but log the issue
      } else {
        console.log(
          `Stored Google Event ID ${googleEventId} for local event ${event.id}`
        );
      }
    } else {
      console.warn(
        `Could not store Google Event ID. Google Event ID: ${googleEventId}, Local Event ID: ${event.id}`
      );
    }

    return NextResponse.json({ googleEventId: googleEventId }, { status: 200 });
  } catch (error: any) {
    console.error('Failed to sync with Google Calendar (POST):', error);
    if (error.response?.data?.error === 'invalid_grant') {
      return NextResponse.json(
        {
          error: 'Google token invalid, please re-authenticate.',
          needsReAuth: true,
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to sync event with Google Calendar' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  // Expecting local event ID, google event ID, and the updated data
  const {
    eventId,
    googleCalendarEventId,
    eventUpdates,
  }: {
    eventId: string;
    googleCalendarEventId: string;
    eventUpdates: Partial<CalendarEvent>;
  } = body;

  if (!googleCalendarEventId) {
    return NextResponse.json(
      { error: 'Missing Google Calendar Event ID' },
      { status: 400 }
    );
  }
  if (!eventUpdates) {
    return NextResponse.json(
      { error: 'Missing event update data' },
      { status: 400 }
    );
  }

  const supabase = await createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }
  const { data: googleTokens, error: googleTokensError } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (googleTokensError || !googleTokens?.access_token) {
    console.error('Google Tokens Error or Missing:', googleTokensError);
    return NextResponse.json(
      { error: 'Google Calendar not authenticated or tokens missing' },
      { status: 401 }
    );
  }

  try {
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    // Prepare the updated Google Event data
    const googleEventUpdate: any = {}; // Use 'any' for flexibility or define a specific type
    if (eventUpdates.title !== undefined)
      googleEventUpdate.summary = eventUpdates.title || 'Untitled Event';
    if (eventUpdates.description !== undefined)
      googleEventUpdate.description = eventUpdates.description || '';
    if (eventUpdates.location !== undefined)
      googleEventUpdate.location = eventUpdates.location || ''; // Update location

    // Handle date/time updates with all-day detection
    if (eventUpdates.start_at || eventUpdates.end_at) {
      // Fetch the existing event to get complete date information
      const { data: existingEvent } = await supabase
        .from('workspace_calendar_events')
        .select('start_at, end_at')
        .eq('google_event_id', googleCalendarEventId)
        .single();

      // Check if this is an all-day event (we need both dates to determine this properly)
      const eventForCheck = {
        start_at: eventUpdates.start_at || existingEvent?.start_at || '',
        end_at: eventUpdates.end_at || existingEvent?.end_at || '',
      };

      const isEventAllDay =
        eventForCheck.start_at && eventForCheck.end_at
          ? isAllDayEvent(eventForCheck)
          : false;

      if (isEventAllDay) {
        // For all-day events, use date format
        if (eventUpdates.start_at) {
          googleEventUpdate.start = {
            date: dayjs(eventUpdates.start_at).format('YYYY-MM-DD'),
          };
        }
        if (eventUpdates.end_at) {
          googleEventUpdate.end = {
            date: dayjs(eventUpdates.end_at).format('YYYY-MM-DD'),
          };
        }
      } else {
        // For timed events, use dateTime format
        if (eventUpdates.start_at) {
          googleEventUpdate.start = {
            dateTime: eventUpdates.start_at,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        }
        if (eventUpdates.end_at) {
          googleEventUpdate.end = {
            dateTime: eventUpdates.end_at,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        }
      }
    }

    if (eventUpdates.color)
      googleEventUpdate.colorId = getGoogleColorId(eventUpdates.color);

    // Use patch for partial updates, update for full replacement
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: googleCalendarEventId, // The ID of the event on Google Calendar
      requestBody: googleEventUpdate,
    });

    console.log('Google Calendar event updated successfully', {
      eventId: googleCalendarEventId,
    });

    return NextResponse.json(
      { googleEventId: response.data.id },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Failed to update Google Calendar event', {
      eventId: googleCalendarEventId,
      error,
    });
    if (error.response?.data?.error === 'invalid_grant') {
      return NextResponse.json(
        {
          error: 'Google token invalid, please re-authenticate.',
          needsReAuth: true,
        },
        { status: 401 }
      );
    }
    if (error.response?.status === 404 || error.response?.status === 410) {
      // Event not found or gone - maybe it was deleted directly on Google Calendar
      console.warn(
        'Google Calendar event not found for update. Might have been deleted.',
        { eventId: googleCalendarEventId }
      );
      // Optionally: remove the google_calendar_event_id from Supabase record
      await supabase
        .from('workspace_calendar_events')
        .update({ google_event_id: null })
        .eq('id', eventId);
      return NextResponse.json(
        { error: 'Event not found on Google Calendar', eventNotFound: true },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update event on Google Calendar' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { googleCalendarEventId } = await request.json();

  if (!googleCalendarEventId) {
    return NextResponse.json(
      { error: 'Missing Google Calendar Event ID' },
      { status: 400 }
    );
  }

  const supabase = await createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }
  const { data: googleTokens, error: googleTokensError } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (googleTokensError || !googleTokens?.access_token) {
    console.error('Google Tokens Error or Missing:', googleTokensError);
    return NextResponse.json(
      { error: 'Google Calendar not authenticated or tokens missing' },
      { status: 401 }
    );
  }

  try {
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleCalendarEventId,
    });

    console.log('Google Calendar event deleted successfully', {
      eventId: googleCalendarEventId,
    });
    return NextResponse.json(
      { message: 'Event deleted successfully from Google Calendar' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Failed to delete Google Calendar event', {
      eventId: googleCalendarEventId,
      error,
    });
    if (error.response?.status === 404 || error.response?.status === 410) {
      // Event already gone, consider it a success in terms of local state
      console.warn(
        'Google Calendar event not found for deletion. Assuming already deleted.',
        { eventId: googleCalendarEventId }
      );
      return NextResponse.json(
        {
          message: 'Event already deleted or not found on Google Calendar',
          eventNotFound: true,
        },
        { status: 200 }
      ); // Return success as the goal is achieved
    }
    if (error.response?.data?.error === 'invalid_grant') {
      return NextResponse.json(
        {
          error: 'Google token invalid, please re-authenticate.',
          needsReAuth: true,
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to delete event from Google Calendar' },
      { status: 500 }
    );
  }
}
