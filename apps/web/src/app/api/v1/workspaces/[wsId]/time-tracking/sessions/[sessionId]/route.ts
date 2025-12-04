import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

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

    const sbAdmin = await createAdminClient();

    if (action === 'stop') {
      // Stop the running session
      const endTime = new Date().toISOString();
      const startTime = new Date(session.start_time);
      const durationSeconds = Math.floor(
        (Date.now() - startTime.getTime()) / 1000
      );

      const { data, error } = await sbAdmin
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
        (Date.now() - startTime.getTime()) / 1000
      );

      const { data, error } = await sbAdmin
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
      // Create a new session with the same details, marking it as resumed
      const { data, error } = await sbAdmin
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
          was_resumed: true, // Mark this session as resumed
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

      // CRITICAL: Prevent future sessions - this check cannot be bypassed
      const now = new Date();
      if (startTime !== undefined) {
        const start = new Date(startTime);
        if (start > now) {
          return NextResponse.json(
            { error: 'Cannot update a time tracking session to have a start time in the future.' },
            { status: 400 }
          );
        }
      }

      if (endTime !== undefined) {
        const end = new Date(endTime);
        if (end > now) {
          return NextResponse.json(
            { error: 'Cannot update a time tracking session to have an end time in the future.' },
            { status: 400 }
          );
        }
      }

      const updateData: {
        updated_at: string;
        title?: string;
        description?: string | null;
        category_id?: string | null;
        task_id?: string | null;
        start_time?: string;
        end_time?: string;
        duration_seconds?: number;
      } = {
        updated_at: new Date().toISOString(),
      };

      if (title !== undefined) updateData.title = title.trim();
      if (description !== undefined)
        updateData.description = description?.trim() || null;
      if (categoryId !== undefined) updateData.category_id = categoryId || null;
      if (taskId !== undefined) updateData.task_id = taskId || null;

      // Only update times for completed sessions
      if (!session.is_running) {
        // Check if editing time fields is requested
        const isEditingTime = startTime !== undefined || endTime !== undefined;

        if (isEditingTime) {
          // Fetch workspace threshold setting
          const { data: workspaceSettings } = await sbAdmin
            .from('workspace_settings')
            .select('missed_entry_date_threshold')
            .eq('ws_id', wsId)
            .maybeSingle();

          // null/undefined means no approval needed - skip all threshold checks
          const thresholdDays = workspaceSettings?.missed_entry_date_threshold;

          // Only apply restrictions if threshold is explicitly set (not null)
          if (thresholdDays !== null && thresholdDays !== undefined) {
            // Check if threshold is 0 (all edits require approval)
            if (thresholdDays === 0) {
              return NextResponse.json(
                {
                  error:
                    'All time edits must be submitted as requests for approval',
                },
                { status: 400 }
              );
            }

            // Check if more than threshold days have passed since the session start time
            const sessionStartTime = new Date(session.start_time);
            const thresholdAgo = new Date();
            thresholdAgo.setDate(thresholdAgo.getDate() - thresholdDays);

            if (sessionStartTime < thresholdAgo) {
              return NextResponse.json(
                {
                  error: `Cannot edit start time or end time for sessions older than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''}`,
                },
                { status: 400 }
              );
            }

            // NEW CHECK: Prevent backdating sessions to more than threshold days ago
            // This prevents the vulnerability of creating a session for today and moving it back to a month ago
            if (startTime) {
              const newStartTime = new Date(startTime);
              if (newStartTime < thresholdAgo) {
                return NextResponse.json(
                  {
                    error: `Cannot update session to a start time more than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''} ago`,
                  },
                  { status: 400 }
                );
              }
            }
          }
        }

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

      const { data, error } = await sbAdmin
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
    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin
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
