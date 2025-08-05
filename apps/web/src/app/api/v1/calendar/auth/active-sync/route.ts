import { PORT } from '@/constants/common';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import { updateLastUpsert } from '@tuturuuu/utils/calendar-sync-coordination';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import dayjs from 'dayjs';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // 1. Get the wsId and start/end dates from the request
    const { wsId, startDate, endDate } = await request.json();

    if (!wsId) {
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // 2. Create an admin client and get the user
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

    const sbAdmin = await createAdminClient();

    // 3. Insert a dashboard record (only in DEV_MODE)
    let insertDashboardData = null;
    if (DEV_MODE) {
      const { data: dashboardData, error: insertDashboardError } = await sbAdmin
        .from('calendar_sync_dashboard')
        .insert({
          ws_id: wsId,
          start_time: startDate,
          end_time: endDate,
          status: 'running',
          type: 'active',
          inserted_events: 0,
          updated_events: 0,
          deleted_events: 0,
          triggered_by: user.id,
        })
        .select()
        .single();

      if (insertDashboardError) {
        return NextResponse.json(
          { error: insertDashboardError.message },
          { status: 500 }
        );
      }
      insertDashboardData = dashboardData;
    }

    // 4. Get the db data
    const startDateDayJS = dayjs(startDate).startOf('day');
    const endDateDayJS = dayjs(endDate).endOf('day');

    const { data: dbData, error: dbError } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId)
      .lt('start_at', endDateDayJS.add(1, 'day').toISOString())
      .gt('end_at', startDateDayJS.toISOString())
      .order('start_at', { ascending: true });

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 5. Fetch from Google Calendar
    const baseUrl = DEV_MODE
      ? `http://localhost:${PORT}`
      : 'https://tuturuuu.com';

    const response = await fetch(
      `${baseUrl}/api/v1/calendar/auth/fetch?wsId=${wsId}&startDate=${startDate}&endDate=${endDate}`,
      {
        headers: {
          Cookie: request.headers.get('cookie') || '',
        },
      }
    );

    const googleResponse = await response.json();

    if (!response.ok) {
      console.error(googleResponse);
      return NextResponse.json(
        {
          error:
            googleResponse.error +
            '. ' +
            googleResponse.googleError +
            ': ' +
            googleResponse.details?.reason,
        },
        { status: 500 }
      );
    }

    // 6. Get events to delete and delete them
    const googleEventIds = new Set(
      googleResponse.events.map(
        (e: WorkspaceCalendarEvent) => e.google_event_id
      )
    );

    // Only delete events that:
    // 1. Have a google_event_id (were synced from Google)
    // 2. Are no longer present in the current Google Calendar events
    const eventsToDelete = dbData?.filter(
      (e: WorkspaceCalendarEvent) =>
        e.google_event_id && // Only delete events that were synced from Google
        !googleEventIds.has(e.google_event_id) // And are no longer in Google Calendar
    );

    if (eventsToDelete && eventsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .in(
          'id',
          eventsToDelete.map((e) => e.id)
        );

      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 500 }
        );
      }
    }

    // 7. Get events to upsert and upsert them
    const eventsToUpsert = googleResponse.events.map(
      (event: WorkspaceCalendarEvent) => {
        const existingEvent = dbData?.find((e: WorkspaceCalendarEvent) => {
          const matches =
            e.google_event_id === event.google_event_id &&
            e.google_event_id !== null;
          return matches;
        });

        if (existingEvent) {
          return {
            ...event,
            id: existingEvent.id,
            ws_id: wsId,
          };
        }

        return {
          ...event,
          id: crypto.randomUUID(),
          ws_id: wsId,
        };
      }
    );

    // 8. Upsert the events
    if (eventsToUpsert) {
      const { data: upsertData, error: upsertError } = await supabase.rpc(
        'upsert_calendar_events_and_count',
        {
          events: eventsToUpsert,
        }
      );

      if (upsertError) {
        console.error(upsertError);
        return NextResponse.json(
          { error: upsertError.message },
          { status: 500 }
        );
      }
      await updateLastUpsert(wsId, supabase);

      // 9. Prepare to update sync dashboard: Get the upsert data
      const result = upsertData as { inserted: number; updated: number };

      // 3. Update the dashboard record with the upsert data
      if (DEV_MODE && insertDashboardData) {
        const { error: updateDashboardError } = await sbAdmin
          .from('calendar_sync_dashboard')
          .update({
            inserted_events: result?.inserted || 0,
            updated_events: result?.updated || 0,
            deleted_events: eventsToDelete?.length || 0,
            status: 'completed',
            end_time: new Date().toISOString(),
          })
          .eq('id', insertDashboardData.id);

        if (updateDashboardError) {
          console.error(updateDashboardError);
          return NextResponse.json(
            { error: updateDashboardError.message },
            { status: 500 }
          );
        }
      }
      return NextResponse.json({
        dbData,
        googleData: googleResponse.events,
      });
    }

    return NextResponse.json({
      dbData,
      googleData: googleResponse.events,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
