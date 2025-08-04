import {
  formatEventForDb,
  getActiveSyncToken,
  getGoogleAuthClient,
  storeActiveSyncToken,
  syncWorkspaceBatched,
} from '@tuturuuu/trigger/google-calendar-sync';
import { google } from 'googleapis';

/**
 * Filters events by date range and status using a pipe pattern
 */
function filterEventsByDateAndStatus(
  events: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date
) {
  return events
    .filter((event) => {
      // Filter by date range first
      const eventStart = event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
          ? new Date(event.start.date)
          : null;

      const eventEnd = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
          ? new Date(event.end.date)
          : null;

      // If event has no start date, exclude it
      if (!eventStart) return false;

      // Check if event overlaps with the date range
      const eventEndTime = eventEnd || eventStart;
      return eventStart <= endDate && eventEndTime >= startDate;
    })
    .reduce(
      (acc, event) => {
        // Then filter by status
        if (event.status === 'cancelled') {
          acc.eventsToDelete.push(event);
        } else {
          acc.eventsToUpsert.push(event);
        }
        return acc;
      },
      {
        eventsToUpsert: [] as calendar_v3.Schema$Event[],
        eventsToDelete: [] as calendar_v3.Schema$Event[],
      }
    );
}

export async function performIncrementalActiveSync(
  wsId: string,
  calendarId: string = 'primary',
  startDate: Date,
  endDate: Date
) {
  if (!wsId) {
    return NextResponse.json(
      {
        error: 'Failed to fetch Google Calendar events',
        statusCode: 400,
        googleError: 'Missing workspace ID',
        details: {
          hasAccessToken: false,
          hasRefreshToken: false,
          userId: user.id,
          reason: 'No workspace ID provided',
        },
      },
      { status: 400 }
    );
  }

  const result = await supabase
    .from('calendar_auth_tokens')
    .select('access_token, refresh_token')
    .eq('user_id', user.id)
    .eq('ws_id', wsId) // Add ws_id to the query
    .maybeSingle();

  googleTokens = result.data;
  googleTokensError = result.error;

  if (googleTokensError) {
    console.error('Database query error:', {
      error: googleTokensError,
      message: googleTokensError.message,
      details: googleTokensError.details,
      hint: googleTokensError.hint,
      code: googleTokensError.code,
      userId: user.id,
      wsId,
    });

    // If it's a not found error, handle it gracefully
    if (googleTokensError.code === 'PGRST116') {
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 401,
          googleError: 'Google Calendar not authenticated',
          details: {
            hasAccessToken: false,
            hasRefreshToken: false,
            userId: user.id,
            reason: 'No tokens found in database',
          },
        },
        { status: 401 }
      );
    }

    // For other database errors, return 500
    return NextResponse.json(
      {
        error: 'Failed to fetch Google Calendar events',
        statusCode: 500,
        googleError: 'Database error',
        details: {
          tokenError: googleTokensError.message,
          hasAccessToken: false,
          hasRefreshToken: false,
          userId: user.id,
          errorCode: googleTokensError.code,
        },
      },
      { status: 500 }
    );
  }

  // Type assertion for the tokens
  const tokens = googleTokens as {
    access_token: string;
    refresh_token: string;
  } | null;

  if (!tokens?.access_token) {
    console.error('No Google access token found for user:', {
      userId: user.id,
      hasAccessToken: !!tokens?.access_token,
      hasRefreshToken: !!tokens?.refresh_token,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch Google Calendar events',
        statusCode: 401,
        googleError: 'Google Calendar not authenticated',
        details: {
          hasAccessToken: false,
          hasRefreshToken: !!tokens?.refresh_token,
          userId: user.id,
          reason: 'Access token is empty',
        },
      },
      { status: 401 }
    );
  }

  const auth = getGoogleAuthClient({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
  });
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const syncToken = await getActiveSyncToken(wsId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allEvents: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const res = await calendar.events.list({
        calendarId,
        syncToken: syncToken || undefined,
        showDeleted: true,
        singleEvents: true,
        pageToken,
        maxResults: 2500,
      });
      const events = res.data.items || [];
      allEvents = allEvents.concat(events);
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    if (allEvents.length > 0) {
      await incrementalActiveSync(wsId, allEvents, startDate, endDate);
    }

    if (nextSyncToken) {
      await storeActiveSyncToken(wsId, nextSyncToken, new Date());
    }

    return allEvents;
  } catch (error) {
    console.error('Error fetching sync token:', error);
    throw error;
  }
}

async function incrementalActiveSync(
  wsId: string,
  eventsToSync: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date
) {
  // Use the pipe to filter events by date range first, then by status
  const { eventsToUpsert, eventsToDelete } = filterEventsByDateAndStatus(
    eventsToSync,
    startDate,
    endDate
  );

  const formattedEventsToUpsert = eventsToUpsert.map((event) => {
    return formatEventForDb(event, wsId);
  });

  const formattedEventsToDelete = eventsToDelete.map((event) => {
    return formatEventForDb(event, wsId);
  });

  return { formattedEventsToUpsert, formattedEventsToDelete };
}
