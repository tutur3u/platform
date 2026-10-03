import { google, OAuth2Client } from '@tuturuuu/google';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { unsupportedProviderSaga } from '@/lib/calendar/google-color-operations/provider-saga-routes';
import { getCalendarRetainedGeneration } from '@/lib/calendar/google-color-operations/retained-generation-request-access';
import {
  googleColorOperationModeEnabled,
  handleRecoverableGooglePut,
  unsupportedGoogleMutation,
} from '@/lib/calendar/google-color-operations/route-handlers';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

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

export async function POST(request: Request) {
  console.log('🔵 [API] POST /api/v1/calendar/auth/sync-to-google called');

  const authContext = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
  });

  console.log('🔵 [API] Auth check:', {
    hasUser: authContext.ok,
    userId: authContext.ok ? authContext.user.id : undefined,
  });

  if (!authContext.ok) {
    console.log('❌ [API] User not authenticated');
    return authContext.response;
  }

  const { supabase, user } = authContext;

  try {
    const { wsId, startDate, endDate } = await request.json();

    console.log('🔵 [API] Request body:', { wsId, startDate, endDate });

    if (!wsId) {
      console.log('❌ [API] Missing workspace ID');
      return NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const access = await authorizeCalendarEventManagement(
      request,
      normalizedWsId
    );
    if ('error' in access) return access.error;

    // Get Google auth tokens
    console.log('🔵 [API] Fetching Google auth tokens...');
    const { data: googleTokens, error: tokensError } = await supabase
      .from('calendar_auth_tokens')
      .select('id, access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    console.log('🔵 [API] Google tokens result:', {
      hasTokens: !!googleTokens,
      hasAccessToken: !!googleTokens?.access_token,
      hasRefreshToken: !!googleTokens?.refresh_token,
      error: tokensError?.message,
    });

    if (tokensError || !googleTokens?.access_token) {
      console.log('❌ [API] Google Calendar not connected');
      return NextResponse.json(
        { error: 'Google Calendar not connected' },
        { status: 401 }
      );
    }

    // Get calendar connections
    console.log('🔵 [API] Fetching calendar connections...');
    const { data: calendarConnections, error: connectionsError } =
      await supabase
        .from('calendar_connections')
        .select('calendar_id, is_enabled')
        .eq('ws_id', normalizedWsId)
        .eq('is_enabled', true)
        .eq('auth_token_id', googleTokens.id);

    console.log('🔵 [API] Calendar connections result:', {
      count: calendarConnections?.length || 0,
      connections: calendarConnections,
      error: connectionsError?.message,
    });

    if (connectionsError) {
      console.log('❌ [API] Failed to fetch calendar connections');
      return NextResponse.json(
        { error: 'Failed to fetch calendar connections' },
        { status: 500 }
      );
    }

    const enabledCalendarIds =
      calendarConnections && calendarConnections.length > 0
        ? calendarConnections.map((conn) => conn.calendar_id)
        : ['primary'];

    console.log('🔵 [API] Enabled calendar IDs:', enabledCalendarIds);

    // Fetch Tuturuuu events that need to be synced
    const start = dayjs(startDate).startOf('day');
    const end = dayjs(endDate).endOf('day');

    console.log('🔵 [API] Fetching Tuturuuu events...', {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    const { data: tuturuuuEvents, error: eventsError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', normalizedWsId)
      .lt('start_at', end.add(1, 'day').toISOString())
      .gt('end_at', start.toISOString())
      .order('start_at', { ascending: true });

    console.log('🔵 [API] Tuturuuu events result:', {
      count: tuturuuuEvents?.length || 0,
      eventsWithGoogleId:
        tuturuuuEvents?.filter((e) => e.google_event_id).length || 0,
      eventsWithoutGoogleId:
        tuturuuuEvents?.filter((e) => !e.google_event_id).length || 0,
      error: eventsError?.message,
    });

    if (eventsError) {
      console.log('❌ [API] Failed to fetch Tuturuuu events');
      return NextResponse.json(
        { error: 'Failed to fetch Tuturuuu events' },
        { status: 500 }
      );
    }

    if (!tuturuuuEvents || tuturuuuEvents.length === 0) {
      console.log('⚠️ [API] No events to sync');
      return NextResponse.json({
        success: true,
        syncedCount: 0,
        errorCount: 0,
        totalEvents: 0,
      });
    }

    // Preflight the entire batch before any provider dispatch, regardless of
    // feature mode. A legacy batch may not compete with retained generations.
    for (const event of tuturuuuEvents) {
      if (
        !event.locked &&
        (await getCalendarRetainedGeneration(request, normalizedWsId, event.id))
      )
        return unsupportedProviderSaga();
    }

    if (googleColorOperationModeEnabled()) {
      const writable = tuturuuuEvents.filter((event) => !event.locked);
      // Preflight the entire batch: no partial dispatch before discovering an
      // unsupported create. A missing remote event never falls back to insert.
      if (writable.some((event) => !event.google_event_id))
        return unsupportedGoogleMutation();
      let syncedCount = 0;
      for (const event of writable) {
        const result = await handleRecoverableGooglePut({
          request,
          sendUpdates: 'none',
          rawWsId: normalizedWsId,
          eventId: event.id,
          updates: {
            title: event.title,
            description: event.description ?? '',
            location: event.location ?? '',
            start_at: event.start_at,
            end_at: event.end_at,
          },
        });
        if (!result.ok) return result;
        syncedCount++;
      }
      return NextResponse.json({
        success: true,
        syncedCount,
        errorCount: 0,
        totalEvents: tuturuuuEvents.length,
      });
    }

    // Setup Google Calendar API
    console.log('🔵 [API] Setting up Google Calendar API client...');
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    let syncedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    console.log(
      `🔵 [API] Starting sync loop for ${tuturuuuEvents.length} events...`
    );

    // Sync each event to Google
    for (const event of tuturuuuEvents) {
      console.log(
        `🔵 [API] Processing event: "${event.title}" (ID: ${event.id})`,
        {
          hasGoogleEventId: !!event.google_event_id,
          googleEventId: event.google_event_id,
          googleCalendarId: event.google_calendar_id,
          locked: event.locked,
        }
      );

      // Skip locked events (they are read-only from Google)
      if (event.locked) {
        console.log(`⏭️ [API] Skipping locked event: "${event.title}"`);
        continue;
      }

      try {
        // Determine which calendar to use
        const targetCalendarId =
          event.google_calendar_id &&
          enabledCalendarIds.includes(event.google_calendar_id)
            ? event.google_calendar_id
            : enabledCalendarIds[0];

        console.log(`🔵 [API] Target calendar: ${targetCalendarId}`);

        // Check if event already exists in Google
        if (event.google_event_id) {
          console.log(
            `🔵 [API] Updating existing Google event: ${event.google_event_id}`
          );
          // Update existing event
          try {
            await calendar.events.update({
              calendarId: targetCalendarId,
              eventId: event.google_event_id,
              requestBody: {
                summary: event.title,
                description: event.description || '',
                location: event.location || '',
                start: {
                  dateTime: event.start_at,
                  timeZone: 'UTC',
                },
                end: {
                  dateTime: event.end_at,
                  timeZone: 'UTC',
                },
              },
            });
            console.log(`✅ [API] Successfully updated event: ${event.title}`);
            syncedCount++;
          } catch (updateError: any) {
            // If event not found, create new one
            if (updateError.code === 404) {
              console.log(
                `⚠️ [API] Event not found in Google (404), creating new...`
              );
              const newEvent = await calendar.events.insert({
                calendarId: targetCalendarId,
                requestBody: {
                  summary: event.title,
                  description: event.description || '',
                  location: event.location || '',
                  start: {
                    dateTime: event.start_at,
                    timeZone: 'UTC',
                  },
                  end: {
                    dateTime: event.end_at,
                    timeZone: 'UTC',
                  },
                },
              });

              console.log(
                `✅ [API] Created new Google event: ${newEvent.data.id}`
              );

              // Update Tuturuuu event with new Google event ID
              await supabase
                .from('workspace_calendar_events')
                .update({
                  google_event_id: newEvent.data.id,
                  google_calendar_id: targetCalendarId,
                })
                .eq('id', event.id)
                .eq('ws_id', normalizedWsId);

              syncedCount++;
            } else {
              throw updateError;
            }
          }
        } else {
          console.log(`🔵 [API] Creating new Google event for: ${event.title}`);
          // Create new event in Google
          const newEvent = await calendar.events.insert({
            calendarId: targetCalendarId,
            requestBody: {
              summary: event.title,
              description: event.description || '',
              location: event.location || '',
              start: {
                dateTime: event.start_at,
                timeZone: 'UTC',
              },
              end: {
                dateTime: event.end_at,
                timeZone: 'UTC',
              },
            },
          });

          console.log(`✅ [API] Created new Google event: ${newEvent.data.id}`);

          // Update Tuturuuu event with Google event ID
          const updateResult = await supabase
            .from('workspace_calendar_events')
            .update({
              google_event_id: newEvent.data.id,
              google_calendar_id: targetCalendarId,
            })
            .eq('id', event.id)
            .eq('ws_id', normalizedWsId);

          console.log(`🔵 [API] Updated Tuturuuu event with Google IDs:`, {
            eventId: event.id,
            googleEventId: newEvent.data.id,
            updateError: updateResult.error?.message,
          });

          syncedCount++;
        }
      } catch (eventError: any) {
        console.error(`❌ [API] Error syncing event ${event.id}:`, eventError);
        errorCount++;
        errors.push(
          `Failed to sync "${event.title}": ${eventError.message || 'Unknown error'}`
        );
      }
    }

    console.log(`🏁 [API] Sync complete:`, {
      syncedCount,
      errorCount,
      totalEvents: tuturuuuEvents.length,
    });

    return NextResponse.json({
      success: true,
      syncedCount,
      errorCount,
      totalEvents: tuturuuuEvents?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error syncing to Google Calendar:', error);
    return NextResponse.json(
      {
        error: 'Failed to sync to Google Calendar',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
