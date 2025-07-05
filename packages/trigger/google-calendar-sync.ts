import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import { updateLastUpsert } from '@tuturuuu/utils/calendar-sync-coordination';
import dayjs from 'dayjs';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { convertGoogleAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';

// Dynamic locale setup function
const setupDayjsLocale = async (locale?: string) => {
  const targetLocale = locale || process.env.LOCALE || 'en';
  
  try {
    // Dynamically import the locale module
    await import(`dayjs/locale/${targetLocale}`);
    dayjs.locale(targetLocale);
  } catch (error) {
    console.warn(`Failed to load locale '${targetLocale}', falling back to 'en'`);
    try {
      await import('dayjs/locale/en');
      dayjs.locale('en');
    } catch (fallbackError) {
      console.error('Failed to load even the fallback locale:', fallbackError);
    }
  }
};

// Initialize with default locale
setupDayjsLocale();

// Define the sync result type
type SyncResult = {
  ws_id: string;
  success: boolean;
  eventsSynced?: number;
  eventsDeleted?: number;
  error?: string;
};

export const getGoogleAuthClient = (tokens: {
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
  locale?: string
): Promise<SyncResult> => {
  console.log(`Syncing Google Calendar events for workspace ${ws_id} from ${timeMin.format('YYYY-MM-DD HH:mm')} to ${timeMax.format('YYYY-MM-DD HH:mm')}`);

  // Setup locale for this sync operation
  if (locale) {
    await setupDayjsLocale(locale);
  }

  try {
    const supabase = await createAdminClient({ noCookie: true });
    const auth = getGoogleAuthClient({ access_token, refresh_token: refresh_token || undefined });

    const calendar = google.calendar({ version: 'v3', auth });

    

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true, // separate recurring events
      orderBy: 'startTime',
      maxResults: 1000,
    });

    const events = response.data.items || [];
    

    // format the events to match the expected structure
    const formattedEvents = events.map((event) => {
      // Use the new timezone-aware conversion for all-day events
      const { start_at, end_at } = convertGoogleAllDayEvent(
        event.start?.dateTime || event.start?.date || '',
        event.end?.dateTime || event.end?.date || '',
        // Use the user's browser timezone which is available in the process.env.TZ or system default
        // This will be enhanced later to use actual user preferences
        'auto'
      );

      return {
        google_event_id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        start_at,
        end_at,
        location: event.location || '',
        color: getColorFromGoogleColorId(event.colorId ?? undefined),
        ws_id: ws_id,
        locked: false,
      };
    });
    

    // upsert the events in the database for this wsId
    
    const { error } = await supabase
      .from('workspace_calendar_events')
      .upsert(formattedEvents, {
        onConflict: 'google_event_id',
      });
    if (error) {
      console.log('Error upserting events:', error);
      throw error;
    }
    console.log(`Upserted ${formattedEvents.length} events:`, formattedEvents.map(e => e.title));

    // Google calendar not null
    
    const { data: dbEventsAfterUpsert, error: dbError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', ws_id)
      .not('google_event_id', 'is', null)
      .gte('end_at', timeMin.toISOString())
      .lte('start_at', timeMax.toISOString());

    if (dbError) {
      console.log('Error fetching database events:', dbError);
      throw dbError;
    }

    console.log(`Found ${dbEventsAfterUpsert.length} existing events in database`);

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

    

    if (eventsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .in(
          'id',
          eventsToDelete.map((e) => e.id)
        );

      if (deleteError) {
        console.log('Error deleting events:', deleteError);
        throw deleteError;
      }

      console.log(`Deleted ${eventsToDelete.length} events:`, eventsToDelete.map(e => e.title));
    }

    // Update lastUpsert timestamp after successful upsert
    
    await updateLastUpsert(ws_id, supabase);
    
    
    return {
      ws_id,
      success: true,
      eventsSynced: formattedEvents.length,
      eventsDeleted: eventsToDelete.length,
    };
  } catch (error) {
    console.log('Error in syncGoogleCalendarEventsForWorkspace:', error);
    return {
      ws_id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Get workspace by ws_id
export const getWorkspaceTokensByWsId = async (ws_id: string) => {
  try {
  const supabase = await createAdminClient({ noCookie: true });
  const { data: tokens, error } = await supabase
    .from('workspaces')
    .select('ws_id, access_token, refresh_token')
    .eq('ws_id', ws_id);

  if (error) {
    console.log('Error fetching workspace tokens:', error);
    return null;
  }

    return tokens?.[0] || null;
  } catch (error) {
    console.log('Error in getWorkspaceTokensByWsId:', error);
    return null;
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
      console.log('Error fetching workspaces for sync:', error);
      return [];
    }

    return tokens || [];
  } catch (error) {
    console.log('Error in getWorkspacesForSync:', error);
    return [];
  }
};

// Sync a single workspace for 4 weeks (28 days) from now
export const syncWorkspaceExtended = async (payload: {
  ws_id: string;
  access_token: string;
  refresh_token?: string;
  locale?: string;
}) => {
  const { ws_id, access_token, refresh_token, locale } = payload;
  
  if (!access_token) {
    console.log('No access token provided for workspace:', ws_id);
    return { ws_id, success: false, error: 'No access token provided' };
  }

  const now = dayjs();
  const timeMin = now; // Start from now
  const timeMax = now.add(28, 'day'); // 4 weeks from now (1 week + 3 weeks)
  
  return syncGoogleCalendarEventsForWorkspace(
    ws_id,
    access_token,
    refresh_token || null,
    timeMin,
    timeMax,
    locale
  );
};

export const syncGoogleCalendarEventsExtended = async (locale?: string) => {
  
  const workspaces = await getWorkspacesForSync();
  const results: SyncResult[] = [];

  for (const workspace of workspaces) {
    try {
      const result = await syncWorkspaceExtended({ ...workspace, locale });
      results.push(result);
    } catch (error) {
      
      results.push({
        ws_id: workspace.ws_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  
  return results;
};

export const storeSyncToken = async (ws_id: string, syncToken: string, lastSyncedAt: Date) => {
  const supabase = await createAdminClient({ noCookie: true });
  const { error } = await supabase
    .from('calendar_sync_states')
    .upsert({ ws_id, sync_token: syncToken, last_synced_at: lastSyncedAt.toISOString() });
  
  if (error) {
    console.log('Error storing sync token:', error);
    throw error;
  }
};


export const getSyncToken = async (ws_id: string) => {
  const supabase = await createAdminClient({ noCookie: true });
  const { data: syncToken, error } = await supabase
    .from('calendar_sync_states')
    .select('sync_token')
    .eq('ws_id', ws_id);

  if (error) {
    console.log('Error fetching sync token:', error);
    throw error;
  }

  return syncToken?.[0]?.sync_token || null;
};