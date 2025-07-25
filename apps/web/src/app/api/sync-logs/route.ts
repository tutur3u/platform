import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

const getUser = async (id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }

  return data;
};

const getWorkspace = async (id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('id', id)
    .single();

  if (error) {
    // Return a default workspace if not found
    return {
      id: id,
      name: `Workspace ${id}`,
      color: 'bg-blue-500',
    };
  }

  return {
    id: data.id,
    name: data.name,
    color: 'bg-blue-500', // Default color since workspaces table doesn't have a color field
  };
};

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

  // Process the data to match the expected SyncLog format
  const processedData = await Promise.all(
    data.map(async (item) => {
      // Get workspace info
      const workspace = await getWorkspace(item.ws_id);

      // Get user info if triggered_by exists
      const userData = item.triggered_by
        ? await getUser(item.triggered_by)
        : null;
      const triggeredBy = userData
        ? {
            id: userData.id,
            name: userData.display_name || 'Unknown User',
            email: 'user@example.com', // email column removed from query
            avatar:
              userData.avatar_url || '/placeholder.svg?height=32&width=32',
          }
        : null;

      // Calculate duration
      const duration =
        item.endtime && item.starttime
          ? new Date(item.endtime).getTime() -
            new Date(item.starttime).getTime()
          : 0;

      return {
        id: item.id,
        timestamp: item.starttime
          ? new Date(item.starttime).toISOString()
          : new Date().toISOString(),
        type: item.type || 'background',
        workspace: workspace,
        triggeredBy: triggeredBy,
        status: item.status || 'completed',
        duration: duration,
        events: {
          added: item.events_inserted || 0,
          updated: item.events_updated || 0,
          deleted: item.events_deleted || 0,
        },
        calendarSource: 'Google Calendar',
        error: null,
      };
    })
  );

  return NextResponse.json(processedData);
}
