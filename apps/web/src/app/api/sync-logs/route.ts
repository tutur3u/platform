import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('calendar_sync_dashboard')
    .select(
      'id, starttime, type, ws_id, triggered_by, status, endtime, events_inserted, events_updated, events_deleted'
    )
    .order('starttime', { ascending: true });

  if (error)
    return NextResponse.json(
      { message: 'Error fetching sync logs' },
      { status: 500 }
    );

  return NextResponse.json(
    data.map(({ ...rest }) => ({
      id: rest.id,
      starttime: rest.starttime ? new Date(rest.starttime).toISOString() : null,
      type: rest.type,
      workspace: rest.ws_id,
      triggeredBy: rest.triggered_by,
      status: rest.status,
      duration:
        rest.endtime && rest.starttime
          ? new Date(rest.endtime).getTime() -
            new Date(rest.starttime).getTime()
          : null,
      events: {
        added: rest.events_inserted,
        updated: rest.events_updated,
        deleted: rest.events_deleted,
      },
      calendarSource: 'Google Calendar',
      error: null,
    }))
  );
}
