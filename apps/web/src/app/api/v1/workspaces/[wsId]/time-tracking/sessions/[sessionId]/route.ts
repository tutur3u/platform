import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import dayjs from 'dayjs';

// Helper function to get session chain root (traverse up to find original session)
async function getSessionChainRoot(
  sessionId: string
): Promise<{ rootSessionId: string; chainLength: number }> {
  const sbAdmin = await createAdminClient();

  let currentSessionId = sessionId;
  let chainLength = 1;
  const maxIterations = 100; // Prevent infinite loops

  for (let i = 0; i < maxIterations; i++) {
    const { data: session } = await sbAdmin
      .from('time_tracking_sessions')
      .select('id, parent_session_id')
      .eq('id', currentSessionId)
      .single();

    if (!session || !session.parent_session_id) {
      return { rootSessionId: currentSessionId, chainLength };
    }

    currentSessionId = session.parent_session_id;
    chainLength++;
  }

  throw new Error(
    'Session chain depth exceeds maximum (possible circular reference)'
  );
}

// Helper function to check if session exceeds workspace threshold
// Now accepts optional chainValidation to check root session instead
async function checkSessionThreshold(
  wsId: string,
  sessionStartTime: string,
  options?: {
    sessionId?: string; // If provided, validates root of chain instead
    returnChainDetails?: boolean; // If true, returns full chain summary
    isPauseAction?: boolean; // If true, respects pause_threshold_exempt
  }
): Promise<{
  exceeds: boolean;
  thresholdDays: number | null;
  message?: string;
  chainSummary?: any;
}> {
  const sbAdmin = await createAdminClient();

  // Fetch workspace threshold setting
  const { data: workspaceSettings } = await sbAdmin
    .from('workspace_settings')
    .select('missed_entry_date_threshold, pause_threshold_exempt')
    .eq('ws_id', wsId)
    .single();

  const thresholdDays = workspaceSettings?.missed_entry_date_threshold;
  const pauseThresholdExempt = workspaceSettings?.pause_threshold_exempt;

  // If it's a pause action and pause is exempt, we don't need to check the threshold
  if (options?.isPauseAction && pauseThresholdExempt) {
    return { exceeds: false, thresholdDays: thresholdDays ?? null };
  }

  // If no threshold set (null), no restrictions apply
  if (thresholdDays === null || thresholdDays === undefined) {
    return { exceeds: false, thresholdDays: null };
  }

  // If sessionId provided, check root session instead
  let startTimeToCheck = sessionStartTime;
  let chainSummary: any = null;

  if (options?.sessionId) {
    const { rootSessionId } = await getSessionChainRoot(options.sessionId);

    // Get root session start time
    const { data: rootSession } = await sbAdmin
      .from('time_tracking_sessions')
      .select('start_time')
      .eq('id', rootSessionId)
      .single();

    if (rootSession) {
      startTimeToCheck = rootSession.start_time;
    }

    // Get full chain summary if requested
    if (options.returnChainDetails) {
      const { data: summary } = await sbAdmin.rpc('get_session_chain_summary', {
        session_id_input: options.sessionId,
      });
      chainSummary = summary;
    }
  }

  // If threshold is 0, all missed entries must be submitted as requests
  if (thresholdDays === 0) {
    return {
      exceeds: true,
      thresholdDays: 0,
      message: 'All missed entries must be submitted as requests',
      chainSummary,
    };
  }

  // Check if session start time exceeds the threshold
  const now = dayjs();
  const startTime = dayjs(startTimeToCheck);
  const thresholdAgo = now.subtract(thresholdDays, 'day');

  if (startTime.isBefore(thresholdAgo)) {
    return {
      exceeds: true,
      thresholdDays,
      message: `Cannot complete sessions older than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''}. Please submit a missed entry request instead.`,
      chainSummary,
    };
  }

  return { exceeds: false, thresholdDays, chainSummary };
}

export async function GET(
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

    // Fetch the session with relations
    const { data, error } = await supabase
      .from('time_tracking_sessions')
      .select(
        `
        *,
        category:time_tracking_categories(*),
        task:tasks(*)
      `
      )
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('Error fetching time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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
      // Validate threshold before stopping - checks ENTIRE CHAIN from root
      // This ensures pause exemption doesn't bypass approval requirements
      const thresholdCheck = await checkSessionThreshold(
        wsId,
        session.start_time,
        {
          sessionId: sessionId,
          returnChainDetails: true,
        }
      );

      if (thresholdCheck.exceeds) {
        // Return enhanced error with chain details for approval UI
        return NextResponse.json(
          {
            error:
              thresholdCheck.message || 'Session exceeds workspace threshold',
            code: 'THRESHOLD_EXCEEDED',
            thresholdDays: thresholdCheck.thresholdDays,
            chainSummary: thresholdCheck.chainSummary,
            sessionId: sessionId,
          },
          { status: 400 }
        );
      }

      // Verify if session is already paused (not running)
      const isPaused = !session.is_running;
      const endTime = new Date().toISOString();

      // Find and close any active break for this session
      const { data: activeBreak } = await sbAdmin
        .from('time_tracking_breaks')
        .select('*')
        .eq('session_id', sessionId)
        .is('break_end', null)
        .order('break_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeBreak) {
        // We set break_end and let the DB trigger calculate break_duration_seconds
        // to avoid potential rounding mismatches with the duration_match constraint
        const { error: updateError } = await sbAdmin
          .from('time_tracking_breaks')
          .update({
            break_end: endTime,
          })
          .eq('id', activeBreak.id);

        if (updateError) {
          console.error('Failed to close active break on stop:', updateError);
        }
      }

      // If it's already paused, its duration_seconds is already correctly set for the work segment.
      // We just need to return it as a completed session.
      if (isPaused) {
        const { data, error } = await supabase
          .from('time_tracking_sessions')
          .select(
            `
            *,
            category:time_tracking_categories(*),
            task:tasks(*)
          `
          )
          .eq('id', sessionId)
          .single();

        if (error) throw error;
        return NextResponse.json({ session: data });
      }

      // Normal stop for a running session - calculate duration from start to end
      const startTime = new Date(session.start_time);
      const durationSeconds = Math.floor(
        (new Date(endTime).getTime() - startTime.getTime()) / 1000
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
      // Validate threshold before pausing - checks ENTIRE CHAIN from root
      // This ensures pause doesn't bypass approval requirements when they are strict
      const thresholdCheck = await checkSessionThreshold(
        wsId,
        session.start_time,
        {
          sessionId: sessionId,
          returnChainDetails: true,
          isPauseAction: true,
        }
      );

      if (thresholdCheck.exceeds) {
        // Return enhanced error with chain details for approval UI
        return NextResponse.json(
          {
            error:
              thresholdCheck.message || 'Session exceeds workspace threshold',
            code: 'THRESHOLD_EXCEEDED',
            thresholdDays: thresholdCheck.thresholdDays,
            chainSummary: thresholdCheck.chainSummary,
            sessionId: sessionId,
          },
          { status: 400 }
        );
      }

      const { breakTypeId, breakTypeName } = body;

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

      // Create break record (completed when resumed)
      const { error: breakError } = await sbAdmin
        .from('time_tracking_breaks')
        .insert({
          session_id: sessionId, // Link to the paused session
          break_type_id: breakTypeId || null,
          break_type_name: breakTypeName || 'Break',
          break_start: endTime,
          break_end: null, // Set when resumed
          created_by: user.id,
        });

      if (breakError) {
        console.error('Failed to create break record:', breakError);
        // Don't fail the pause if break record fails - session pause is primary
      }

      return NextResponse.json({ session: data });
    }

    if (action === 'resume') {
      const resumeTime = new Date().toISOString();

      // Find active break for this session to complete it
      const { data: activeBreak } = await sbAdmin
        .from('time_tracking_breaks')
        .select('*')
        .eq('session_id', sessionId)
        .is('break_end', null)
        .order('break_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Complete the break record if found
      if (activeBreak) {
        const { error: updateError } = await sbAdmin
          .from('time_tracking_breaks')
          .update({
            break_end: resumeTime,
          })
          .eq('id', activeBreak.id);

        if (updateError) {
          console.error('Failed to close break on resume:', updateError);
        }
      }

      // Create a new session with the same details, linking to parent
      const { data, error } = await sbAdmin
        .from('time_tracking_sessions')
        .insert({
          ws_id: wsId,
          user_id: user.id,
          title: session.title,
          description: session.description,
          category_id: session.category_id,
          task_id: session.task_id,
          start_time: resumeTime,
          is_running: true,
          was_resumed: true, // Mark this session as resumed (backwards compat)
          parent_session_id: sessionId, // Link to parent in session chain
          created_at: resumeTime,
          updated_at: resumeTime,
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

      // Return both new session and break duration info
      return NextResponse.json({
        session: data,
        breakDuration: activeBreak
          ? Math.floor(
              (new Date(resumeTime).getTime() -
                new Date(activeBreak.break_start).getTime()) /
                1000
            )
          : null,
      });
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
            {
              error:
                'Cannot update a time tracking session to have a start time in the future.',
            },
            { status: 400 }
          );
        }
      }

      if (endTime !== undefined) {
        const end = new Date(endTime);
        if (end > now) {
          return NextResponse.json(
            {
              error:
                'Cannot update a time tracking session to have an end time in the future.',
            },
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
