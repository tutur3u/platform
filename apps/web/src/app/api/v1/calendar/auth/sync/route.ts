import type { CalendarEvent as BaseCalendarEvent } from '@tuturuuu/ai/calendar/events';
import { createClient } from '@tuturuuu/supabase/next/server';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
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

  const supabase = await createClient();

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

    const googleEvent = {
      summary: event.title || 'Untitled Event',
      description: event.description || '',
      location: event.location || '',
      start: {
        dateTime: event.start_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.end_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      colorId: getGoogleColorId(event.color),
    };

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
  } catch (error: unknown) {
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

  const supabase = await createClient();
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
    const googleEventUpdate: Partial<CalendarEvent> = {};
    if (eventUpdates.title !== undefined)
      googleEventUpdate.summary = eventUpdates.title || 'Untitled Event';
    if (eventUpdates.description !== undefined)
      googleEventUpdate.description = eventUpdates.description || '';
    if (eventUpdates.location !== undefined)
      googleEventUpdate.location = eventUpdates.location || ''; // Update location
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
    if (eventUpdates.color)
      googleEventUpdate.colorId = getGoogleColorId(eventUpdates.color);

    // Use patch for partial updates, update for full replacement
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId: googleCalendarEventId, // The ID of the event on Google Calendar
      requestBody: googleEventUpdate,
    });

    console.log(
      `Google Calendar event ${googleCalendarEventId} updated successfully.`
    );

    return NextResponse.json(
      { googleEventId: response.data.id },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error(
      `Failed to update Google Calendar event ${googleCalendarEventId}:`,
      error
    );
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
        `Google Calendar event ${googleCalendarEventId} not found for update. Might have been deleted.`
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

  const supabase = await createClient();
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

    console.log(
      `Google Calendar event ${googleCalendarEventId} deleted successfully.`
    );
    return NextResponse.json(
      { message: 'Event deleted successfully from Google Calendar' },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error(
      `Failed to delete Google Calendar event ${googleCalendarEventId}:`,
      error
    );
    if (error.response?.status === 404 || error.response?.status === 410) {
      // Event already gone, consider it a success in terms of local state
      console.warn(
        `Google Calendar event ${googleCalendarEventId} not found for deletion. Assuming already deleted.`
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
