import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import { updateLastUpsert } from '@tuturuuu/utils/calendar-sync-coordination';
import dayjs from 'dayjs';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

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

const getColorFromGoogleColorId = (colorId?: string): string => {
  const colorMap: Record<string, string> = {
    '1': 'RED',
    '2': 'GREEN',
    '3': 'GRAY',
    '4': 'PINK',
    '5': 'YELLOW',
    '6': 'ORANGE',
    '8': 'CYAN',
    '9': 'PURPLE',
    '10': 'INDIGO',
    '11': 'BLUE',
  };
  return colorId && colorMap[colorId] ? colorMap[colorId] : 'BLUE';
};

// Core sync function for a single workspace
const syncGoogleCalendarEventsForWorkspace = async (
  ws_id: string,
  access_token: string,
  refresh_token: string | null,
  timeMin: dayjs.Dayjs,
  timeMax: dayjs.Dayjs,
  syncType: 'immediate' | 'extended'
) => {
  console.log(`[${ws_id}] Starting ${syncType} sync process...`);
  console.log(`[${ws_id}] Time range: ${timeMin.format('YYYY-MM-DD HH:mm')} to ${timeMax.format('YYYY-MM-DD HH:mm')}`);

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const auth = getGoogleAuthClient({ access_token, refresh_token: refresh_token || undefined });

    const calendar = google.calendar({ version: 'v3', auth });

    console.log(`[${ws_id}] Fetching events from Google Calendar...`);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true, // separate recurring events
      orderBy: 'startTime',
      maxResults: 1000,
    });

    const events = response.data.items || [];
    console.log(
      `[${ws_id}] Fetched ${events.length} events from Google Calendar`
    );

    // format the events to match the expected structure
    const formattedEvents = events.map((event) => ({
      google_event_id: event.id,
      title: event.summary || 'Untitled Event',
      description: event.description || '',
      start_at: event.start?.dateTime || event.start?.date || '',
      end_at: event.end?.dateTime || event.end?.date || '',
      location: event.location || '',
      color: getColorFromGoogleColorId(event.colorId ?? undefined),
      ws_id: ws_id,
      locked: false,
    }));
    console.log(`[${ws_id}] Formatted ${formattedEvents.length} events`);

    // upsert the events in the database for this wsId
    console.log(
      `[${ws_id}] Upserting ${formattedEvents.length} events to database...`
    );
    const { error } = await supabase
      .from('workspace_calendar_events')
      .upsert(formattedEvents, {
        onConflict: 'google_event_id',
      });
    if (error) {
      console.error(`[${ws_id}] Error upserting events:`, error);
      throw error;
    }
    console.log(
      `[${ws_id}] Successfully upserted ${formattedEvents.length} events:`,
      formattedEvents.map((e) => e.title)
    );

    // Google calendar not null
    console.log(
      `[${ws_id}] Fetching existing events from database for cleanup...`
    );
    const { data: dbEventsAfterUpsert, error: dbError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', ws_id)
      .not('google_event_id', 'is', null)
      .gte('end_at', timeMin.toISOString())
      .lte('start_at', timeMax.toISOString());

    if (dbError) {
      console.error(
        `[${ws_id}] Error fetching events after upsert:`,
        dbError
      );
      throw dbError;
    }

    console.log(
      `[${ws_id}] Found ${dbEventsAfterUpsert?.length || 0} existing events in database`
    );

    const eventsToDelete: WorkspaceCalendarEvent[] = [];
    for (const event of dbEventsAfterUpsert) {
      if (
        !formattedEvents.some(
          (e) => e.google_event_id === event.google_event_id
        )
      ) {
        eventsToDelete.push(event);
      }
    }

    console.log(
      `[${ws_id}] Found ${eventsToDelete.length} events to delete`
    );

    if (eventsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .in(
          'id',
          eventsToDelete.map((e) => e.id)
        );

      if (deleteError) {
        console.error(`[${ws_id}] Error deleting events:`, deleteError);
        throw deleteError;
      }

      console.log(
        `[${ws_id}] Successfully deleted ${eventsToDelete.length} events:`,
        eventsToDelete.map((e) => e.title)
      );
    }

    // Update lastUpsert timestamp after successful upsert
    console.log(`[${ws_id}] Updating lastUpsert timestamp...`);
    await updateLastUpsert(ws_id, supabase);
    console.log(`[${ws_id}] ${syncType} sync completed successfully`);
    
    return {
      ws_id,
      success: true,
      eventsSynced: formattedEvents.length,
      eventsDeleted: eventsToDelete.length,
    };
  } catch (error) {
    console.error(
      `[${ws_id}] Error in ${syncType} sync:`,
      error
    );
    return {
      ws_id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Get all workspaces that need sync
export const getWorkspacesForSync = async () => {
  try {
    const supabase = await createAdminClient({ noCookie: true });
    
    const { data: tokens, error } = await supabase
      .from('calendar_auth_tokens')
      .select('ws_id, access_token, refresh_token')
      .not('access_token', 'is', null);

    if (error) {
      console.error('Error fetching auth tokens:', error);
      return [];
    }

    return tokens || [];
  } catch (error) {
    console.error('Error getting workspaces for sync:', error);
    return [];
  }
};

// Sync a single workspace for immediate range
export const syncWorkspaceImmediate = async (payload: {
  ws_id: string;
  access_token: string;
  refresh_token?: string;
}) => {
  const { ws_id, access_token, refresh_token } = payload;
  
  if (!access_token) {
    console.error(`[${ws_id}] No access token provided`);
    return { ws_id, success: false, error: 'No access token provided' };
  }

  const now = dayjs();
  const timeMin = now;
  const timeMax = now.add(7, 'day'); // 1 week from now
  
  return syncGoogleCalendarEventsForWorkspace(
    ws_id,
    access_token,
    refresh_token || null,
    timeMin,
    timeMax,
    'immediate'
  );
};

// Sync a single workspace for extended range
export const syncWorkspaceExtended = async (payload: {
  ws_id: string;
  access_token: string;
  refresh_token?: string;
}) => {
  const { ws_id, access_token, refresh_token } = payload;
  
  if (!access_token) {
    console.error(`[${ws_id}] No access token provided`);
    return { ws_id, success: false, error: 'No access token provided' };
  }

  const now = dayjs();
  const timeMin = now.add(7, 'day'); // Start from 1 week from now
  const timeMax = now.add(28, 'day'); // 4 weeks from now (1 week + 3 weeks)
  
  return syncGoogleCalendarEventsForWorkspace(
    ws_id,
    access_token,
    refresh_token || null,
    timeMin,
    timeMax,
    'extended'
  );
};

// Legacy functions for backward compatibility
export const syncGoogleCalendarEventsImmediate = async () => {
  console.log('=== Starting immediate sync for all workspaces ===');
  const workspaces = await getWorkspacesForSync();
  const results = [];

  for (const workspace of workspaces) {
    try {
      const result = await syncWorkspaceImmediate(workspace);
      results.push(result);
    } catch (error) {
      console.error(`Error syncing workspace ${workspace.ws_id}:`, error);
      results.push({
        ws_id: workspace.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  console.log('=== Immediate sync for all workspaces completed ===');
  return results;
};

export const syncGoogleCalendarEventsExtended = async () => {
  console.log('=== Starting extended sync for all workspaces ===');
  const workspaces = await getWorkspacesForSync();
  const results = [];

  for (const workspace of workspaces) {
    try {
      const result = await syncWorkspaceExtended(workspace);
      results.push(result);
    } catch (error) {
      console.error(`Error syncing workspace ${workspace.ws_id}:`, error);
      results.push({
        ws_id: workspace.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  console.log('=== Extended sync for all workspaces completed ===');
  return results;
};

export const syncGoogleCalendarEvents = async () => {
  return syncGoogleCalendarEventsImmediate();
};
