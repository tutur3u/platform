import { CalendarEvent as BaseCalendarEvent } from '@tuturuuu/ai/calendar/events';
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
  const {
    events,
    isBatch = false,
  }: { events: CalendarEvent[] | CalendarEvent; isBatch: boolean } = body;

  // Convert to array if single event is passed
  const eventArray = Array.isArray(events) ? events : [events];

  // Enforce batch limit of 1000 events
  if (eventArray.length > 1000) {
    return NextResponse.json(
      { error: 'Batch size exceeds limit of 1000 events' },
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

    const results = [];

    // Process events in batch (up to 1000 at a time)
    for (const event of eventArray) {
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

      results.push({
        originalEventId: event.id,
        googleEventId: googleEventId,
      });
    }

    return NextResponse.json(
      {
        success: true,
        results: results,
        processedCount: results.length,
      },
      { status: 200 }
    );
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
    isBatch = false,
    events = [],
  }: {
    eventId?: string;
    googleCalendarEventId?: string;
    eventUpdates?: Partial<CalendarEvent>;
    isBatch?: boolean;
    events?: Array<{
      eventId: string;
      googleCalendarEventId: string;
      eventUpdates: Partial<CalendarEvent>;
    }>;
  } = body;

  // Handle batch request or convert single request to batch format
  const updateBatch = isBatch
    ? events
    : [
        {
          eventId,
          googleCalendarEventId,
          eventUpdates,
        },
      ].filter(
        (item) =>
          item.eventId && item.googleCalendarEventId && item.eventUpdates
      );

  // Enforce batch limit
  if (updateBatch.length > 1000) {
    return NextResponse.json(
      { error: 'Batch size exceeds limit of 1000 events' },
      { status: 400 }
    );
  }

  // Validate batch data
  if (updateBatch.length === 0) {
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

    const results = [];
    const errors = [];

    // Process events in batch
    for (const update of updateBatch) {
      try {
        // Skip invalid entries
        if (!update.googleCalendarEventId || !update.eventUpdates) {
          console.warn('Skipping invalid update entry:', update);
          continue;
        }

        // Prepare the updated Google Event data
        const googleEventUpdate: any = {}; // Use 'any' for flexibility or define a specific type
        if (update.eventUpdates.title !== undefined)
          googleEventUpdate.summary =
            update.eventUpdates.title || 'Untitled Event';
        if (update.eventUpdates.description !== undefined)
          googleEventUpdate.description = update.eventUpdates.description || '';
        if (update.eventUpdates.location !== undefined)
          googleEventUpdate.location = update.eventUpdates.location || ''; // Update location
        if (update.eventUpdates.start_at) {
          googleEventUpdate.start = {
            dateTime: update.eventUpdates.start_at,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        }
        if (update.eventUpdates.end_at) {
          googleEventUpdate.end = {
            dateTime: update.eventUpdates.end_at,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
        }
        if (update.eventUpdates.color)
          googleEventUpdate.colorId = getGoogleColorId(
            update.eventUpdates.color
          );

        // Use patch for partial updates, update for full replacement
        const response = await calendar.events.patch({
          calendarId: 'primary',
          eventId: update.googleCalendarEventId, // The ID of the event on Google Calendar
          requestBody: googleEventUpdate,
        });

        console.log(
          `Google Calendar event ${update.googleCalendarEventId} updated successfully.`
        );

        results.push({
          eventId: update.eventId,
          googleEventId: response.data.id,
          success: true,
        });
      } catch (updateError: any) {
        console.error(
          `Failed to update Google Calendar event ${update.googleCalendarEventId}:`,
          updateError
        );

        let errorDetail: {
          eventId: string | undefined;
          googleEventId: string | undefined;
          success: boolean;
          error?: string;
          eventNotFound?: boolean;
          needsReAuth?: boolean;
        } = {
          eventId: update.eventId,
          googleEventId: update.googleCalendarEventId,
          success: false,
        };

        if (
          updateError.response?.status === 404 ||
          updateError.response?.status === 410
        ) {
          // Event not found or gone - maybe it was deleted directly on Google Calendar
          console.warn(
            `Google Calendar event ${update.googleCalendarEventId} not found for update. Might have been deleted.`
          );

          errorDetail.error = 'Event not found on Google Calendar';
          errorDetail.eventNotFound = true;
        } else if (updateError.response?.data?.error === 'invalid_grant') {
          errorDetail.error = 'Google token invalid, please re-authenticate.';
          errorDetail.needsReAuth = true;
        } else {
          errorDetail.error = 'Failed to update event on Google Calendar';
        }

        errors.push(errorDetail);
      }
    }

    return NextResponse.json(
      {
        success: errors.length === 0,
        results: results,
        errors: errors,
        processedCount: results.length,
        errorCount: errors.length,
      },
      { status: errors.length > 0 ? 207 : 200 }
    ); // 207 Multi-Status if some failed
  } catch (error: any) {
    console.error('Failed to process batch update:', error);
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
      { error: 'Failed to update events on Google Calendar' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const body = await request.json();
  const {
    googleCalendarEventId,
    isBatch = false,
    googleCalendarEventIds = [],
  } = body;

  // Process as batch or convert single id to batch
  const eventIds = isBatch
    ? googleCalendarEventIds
    : googleCalendarEventId
      ? [googleCalendarEventId]
      : [];

  // Enforce batch limit
  if (eventIds.length > 1000) {
    return NextResponse.json(
      { error: 'Batch size exceeds limit of 1000 events' },
      { status: 400 }
    );
  }

  if (eventIds.length === 0) {
    return NextResponse.json(
      { error: 'Missing Google Calendar Event ID(s)' },
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

    const results = [];
    const errors = [];

    // Process deletion in batch
    for (const eventId of eventIds) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: eventId,
        });

        console.log(`Google Calendar event ${eventId} deleted successfully.`);
        results.push({ googleEventId: eventId, success: true });
      } catch (deleteError: any) {
        console.error(
          `Failed to delete Google Calendar event ${eventId}:`,
          deleteError
        );

        let errorDetail: {
          googleEventId: string | undefined;
          success: boolean;
          error?: string;
          eventNotFound?: boolean;
          needsReAuth?: boolean;
        } = { googleEventId: eventId, success: false };

        if (
          deleteError.response?.status === 404 ||
          deleteError.response?.status === 410
        ) {
          // Event already gone, consider it a success in terms of local state
          console.warn(
            `Google Calendar event ${eventId} not found for deletion. Assuming already deleted.`
          );
          results.push({
            googleEventId: eventId,
            success: true,
            eventNotFound: true,
            message: 'Event already deleted or not found on Google Calendar',
          });
          continue; // Skip adding to errors
        } else if (deleteError.response?.data?.error === 'invalid_grant') {
          errorDetail.error = 'Google token invalid, please re-authenticate.';
          errorDetail.needsReAuth = true;
        } else {
          errorDetail.error = 'Failed to delete event from Google Calendar';
        }

        errors.push(errorDetail);
      }
    }

    return NextResponse.json(
      {
        success: errors.length === 0,
        results: results,
        errors: errors,
        processedCount: results.length,
        errorCount: errors.length,
      },
      { status: errors.length > 0 ? 207 : 200 }
    ); // 207 Multi-Status if some failed
  } catch (error: any) {
    console.error('Failed to process batch delete:', error);
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
      { error: 'Failed to delete events from Google Calendar' },
      { status: 500 }
    );
  }
}
