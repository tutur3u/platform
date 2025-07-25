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
      'id, starttime, type, ws_id, triggered_by, status, endtime, events_inserted, events_updated, events_deleted'
    )
    .order('starttime', { ascending: true });

  if (error)
    return NextResponse.json(
      { message: 'Error fetching sync logs' },
      { status: 500 }
    );

  // Fetch all required data in batch
  const workspaceIds = [...new Set(data.map((item) => item.ws_id))];
  const userIds = [
    ...new Set(data.map((item) => item.triggered_by).filter(Boolean)),
  ];

  const [workspacesData, usersData] = await Promise.all([
    supabase.from('workspaces').select('id, name').in('id', workspaceIds),
    userIds.length > 0
      ? supabase
          .from('users')
          .select('id, display_name, avatar_url')
          .in('id', userIds as string[])
      : Promise.resolve({ data: [] }),
  ]);

  const workspacesMap = new Map(
    workspacesData.data?.map((w) => [w.id, w]) || []
  );
  const usersMap = new Map(usersData.data?.map((u) => [u.id, u]) || []);

  const processedData = data.map((item) => {
    const workspace = workspacesMap.get(item.ws_id) || {
      id: item.ws_id,
      name: `Workspace ${item.ws_id}`,
      color: 'bg-blue-500',
    };

    const userData = item.triggered_by ? usersMap.get(item.triggered_by) : null;
    const triggeredBy = userData
      ? {
          id: userData.id,
          name: userData.display_name || 'System',
          email: user.email || 'system@tuturuuu.com',
          avatar: userData.avatar_url || '/placeholder.svg?height=32&width=32',
        }
      : null;

    // Calculate duration
    const duration =
      item.endtime && item.starttime
        ? new Date(item.endtime).getTime() - new Date(item.starttime).getTime()
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
  });

  return NextResponse.json(processedData);
}
