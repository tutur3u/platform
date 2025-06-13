import { createAdminClient, createClient } from '@ncthub/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { taskId, taskName, taskDescription } = body;

    if (!taskId || !taskName) {
      return NextResponse.json(
        { error: 'Task ID and name are required' },
        { status: 400 }
      );
    }

    // Verify task belongs to workspace
    const { data: taskCheck } = await supabase
      .from('tasks')
      .select('id, name')
      .eq('id', taskId)
      .single();

    if (!taskCheck) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Use service role client for secure operations
    const adminSupabase = await createAdminClient();

    // Stop any existing running sessions
    await adminSupabase
      .from('time_tracking_sessions')
      .update({
        end_time: new Date().toISOString(),
        is_running: false,
        updated_at: new Date().toISOString(),
      })
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .eq('is_running', true);

    // Create new session with server timestamp
    const { data, error } = await adminSupabase
      .from('time_tracking_sessions')
      .insert({
        ws_id: wsId,
        user_id: user.id,
        task_id: taskId,
        title: `Working on: ${taskName}`,
        description: taskDescription || null,
        start_time: new Date().toISOString(),
        is_running: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(
        `
        *,
        category:time_tracking_categories(*),
        task:tasks(*)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (error) {
    console.error('Error starting quick timer:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
