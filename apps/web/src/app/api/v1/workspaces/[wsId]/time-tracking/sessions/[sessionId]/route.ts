import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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

    // Verify session ownership
    const { data: sessionCheck } = await supabase
      .from('time_tracking_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!sessionCheck) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const {
      action,
      title,
      description,
      categoryId,
      taskId,
      startTime,
      endTime,
      tags,
    } = body;

    // Use service role client for secure operations
    const adminSupabase = await createAdminClient();

    if (action === 'stop') {
      if (!sessionCheck.is_running) {
        return NextResponse.json(
          { error: 'Session is not running' },
          { status: 400 }
        );
      }

      // Stop the session with server timestamp
      const stopTime = new Date().toISOString();
      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .update({
          end_time: stopTime,
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
      if (sessionCheck.is_running) {
        return NextResponse.json(
          { error: 'Session is already running' },
          { status: 400 }
        );
      }

      // Stop any other running sessions first
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

      // Create a new session with the same details (better for tracking history)
      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .insert({
          ws_id: wsId,
          user_id: user.id,
          title: sessionCheck.title,
          description: sessionCheck.description,
          category_id: sessionCheck.category_id,
          task_id: sessionCheck.task_id,
          tags: sessionCheck.tags,
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

    if (action === 'pause') {
      if (!sessionCheck.is_running) {
        return NextResponse.json(
          { error: 'Session is not running' },
          { status: 400 }
        );
      }

      // Pause the session by stopping it but keeping it resumable
      const pauseTime = new Date().toISOString();
      const { data, error } = await adminSupabase
        .from('time_tracking_sessions')
        .update({
          end_time: pauseTime,
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

    if (action === 'edit') {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined)
        updateData.description = description?.trim() || null;
      if (categoryId !== undefined) updateData.category_id = categoryId || null;
      if (taskId !== undefined) updateData.task_id = taskId || null;
      if (tags !== undefined) updateData.tags = tags;

      // Only allow editing times for completed sessions
      if (!sessionCheck.is_running) {
        if (startTime !== undefined) updateData.start_time = startTime;
        if (endTime !== undefined) updateData.end_time = endTime;
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

    // Verify session ownership and that it's not running
    const { data: sessionCheck } = await supabase
      .from('time_tracking_sessions')
      .select('id, user_id, is_running, title')
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!sessionCheck) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      );
    }

    if (sessionCheck.is_running) {
      return NextResponse.json(
        { error: 'Cannot delete running session' },
        { status: 400 }
      );
    }

    // Use service role client for secure operations
    const adminSupabase = await createAdminClient();

    // Delete the session
    const { error } = await adminSupabase
      .from('time_tracking_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;

    return NextResponse.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
