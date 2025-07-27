import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('calendar_sync_dashboard')
    .select(
      'id, start_time, type, ws_id, triggered_by, status, end_time, inserted_events, updated_events, deleted_events, workspaces!inner(id, name), users(id, display_name, avatar_url)'
    )
    .order('start_time', { ascending: true });

  if (error)
    return NextResponse.json(
      { message: 'Error fetching sync logs' },
      { status: 500 }
    );

  const processedData = data.map((item) => {
    const workspace = item.workspaces || {
      id: item.ws_id,
      name: `Workspace ${item.ws_id}`,
      color: 'bg-blue-500',
    };

    const userData = item.users;
    const triggeredBy = userData
      ? {
          id: userData.id,
          name: userData.display_name || 'System',
          avatar: userData.avatar_url || '/placeholder.svg?height=32&width=32',
        }
      : null;

    // Calculate duration
    const duration =
      item.end_time && item.start_time
        ? new Date(item.end_time).getTime() -
          new Date(item.start_time).getTime()
        : 0;

    return {
      id: item.id,
      timestamp: item.start_time
        ? new Date(item.start_time).toISOString()
        : new Date().toISOString(),
      type: item.type || 'background',
      workspace: workspace,
      triggeredBy: triggeredBy,
      status: item.status || 'completed',
      duration: duration,
      events: {
        added: item.inserted_events || 0,
        updated: item.updated_events || 0,
        deleted: item.deleted_events || 0,
      },
      calendarSource: 'Google Calendar',
      error: null,
    };
  });

  return NextResponse.json(processedData);
}
