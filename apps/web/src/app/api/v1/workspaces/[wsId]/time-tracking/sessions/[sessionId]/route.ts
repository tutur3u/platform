import {
  createAdminClient,
  createClient,
} from '@ncthub/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  try {
    const { wsId, sessionId } = await params;
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
    const { action } = body;

    // Verify session exists and belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('time_tracking_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const adminSupabase = await createAdminClient();

    if (action === 'stop') {
      // Stop the running session
      const endTime = new Date().toISOString();
      const startTime = new Date(session.start_time);
      const durationSeconds = Math.floor(
        (new Date().getTime() - startTime.getTime()) / 1000
      );

      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .update({
          end_time: endTime,
          duration_seconds: durationSeconds,
          is_running: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .single();

      if (error) throw error;
      return NextResponse.json({ session: data });
    }

    if (action === 'pause') {
      // Pause the session by stopping it
      const endTime = new Date().toISOString();
      const startTime = new Date(session.start_time);
      const durationSeconds = Math.floor(
        (new Date().getTime() - startTime.getTime()) / 1000
      );

      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .update({
          end_time: endTime,
          duration_seconds: durationSeconds,
          is_running: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .single();

      if (error) throw error;
      return NextResponse.json({ session: data });
    }

    if (action === 'resume') {
      // Create a new session with the same details
      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .insert({
          ws_id: wsId,
          user_id: user.id,
          title: session.title,
          description: session.description,
          category_id: session.category_id,
          task_id: session.task_id,
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
      return NextResponse.json({ session: data });
    }

    if (action === 'edit') {
      // Edit session details
      const { title, description, categoryId, taskId, startTime, endTime } =
        body;

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined)
        updateData.description = description?.trim() || null;
      if (categoryId !== undefined) updateData.category_id = categoryId || null;
      if (taskId !== undefined) updateData.task_id = taskId || null;

      // Only update times for completed sessions
      if (!session.is_running) {
        if (startTime)
          updateData.start_time = new Date(startTime).toISOString();
        if (endTime) {
          updateData.end_time = new Date(endTime).toISOString();
          // Recalculate duration if both times are provided
          if (startTime && endTime) {
            const start = new Date(startTime);
            const end = new Date(endTime);
            updateData.duration_seconds = Math.floor(
              (end.getTime() - start.getTime()) / 1000
            );
          }
        }
      }

      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select(
          `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
        )
        .single();

      if (error) throw error;
      return NextResponse.json({ session: data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error updating time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  try {
    const { wsId, sessionId } = await params;
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

    // Verify session exists and belongs to user
    const { data: session } = await supabase
      .from('time_tracking_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Delete the session
    const adminSupabase = await createAdminClient();
    const { error } = await adminSupabase
      .from('time_tracking_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
