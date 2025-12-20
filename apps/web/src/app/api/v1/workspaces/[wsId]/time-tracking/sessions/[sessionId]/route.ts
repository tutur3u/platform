import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import dayjs from 'dayjs';
import { type NextRequest, NextResponse } from 'next/server';

interface ChainSummary {
  sessions: Array<{
    id: string;
    title: string | null;
    description: string | null;
    start_time: string;
    end_time: string | null;
    duration_seconds: number;
    category_id: string | null;
    task_id: string | null;
    chain_position: number;
  }>;
  breaks: Array<{
    id: string;
    session_id: string;
    break_type_name: string;
    break_start: string;
    break_end: string | null;
    break_duration_seconds: number;
  }>;
  total_sessions: number;
  total_duration_seconds: number;
  first_start_time: string;
  last_end_time: string | null;
}

// Helper function to get session chain root (traverse up to find original session)
async function getSessionChainRoot(
  sessionId: string
): Promise<{ rootSessionId: string }> {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .rpc('get_session_chain_root', {
      session_id_input: sessionId,
    })
    .single();

  if (error || !data) {
    // Fallback to the session itself if chain extraction fails
    return { rootSessionId: sessionId };
  }

  return {
    rootSessionId: (data as { root_session_id: string }).root_session_id,
  };
}

// Helper function to check if session exceeds workspace threshold
// Now accepts optional chainValidation to check root session instead
async function checkSessionThreshold(
  wsId: string,
  sessionStartTime: string,
  options?: {
    sessionId?: string; // If provided, validates root of chain instead
    returnChainDetails?: boolean; // If true, returns full chain summary
  }
): Promise<{
  exceeds: boolean;
  thresholdDays: number | null;
  message?: string;
  chainSummary?: ChainSummary;
}> {
  const sbAdmin = await createAdminClient();

  // Fetch workspace threshold setting
  const { data: workspaceSettings } = await sbAdmin
    .from('workspace_settings')
    .select('missed_entry_date_threshold')
    .eq('ws_id', wsId)
    .single();

  const thresholdDays = workspaceSettings?.missed_entry_date_threshold;

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
      // Check if session has pending approval (means it was paused with a break and has a request pending)
      // If so, skip threshold validation since approval was already handled during pause
      const hasPendingApproval = session.pending_approval === true;

      // Validate threshold before stopping - checks ENTIRE CHAIN from root
      // This ensures pause exemption doesn't bypass approval requirements
      // BUT skip if session already has pending approval (request already submitted)
      if (!hasPendingApproval) {
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
      const { breakTypeId, breakTypeName, pendingApproval } = body;

      // IMPORTANT: Skip threshold validation when pausing to take a break
      // In this case, we're creating an approval request immediately after the pause,
      // so the threshold check will be enforced at the request creation level, not here.
      // This allows the break to be created and displayed to the user immediately.
      const isBreakPause = breakTypeId || breakTypeName;

      if (!isBreakPause) {
        // Only validate threshold if NOT pausing for a break
        // Validate threshold before pausing - checks ENTIRE CHAIN from root
        // This ensures pause doesn't bypass approval requirements when they are strict
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
      }

      // Pause the session by stopping it
      const endTime = new Date().toISOString();
      const startTime = new Date(session.start_time);
      const durationSeconds = Math.floor(
        (Date.now() - startTime.getTime()) / 1000
      );

      // If pausing for a break, create the break record FIRST before pausing
      // This way if pause fails due to threshold, at least the break intent is recorded
      if (isBreakPause) {
        // Get Workspace Default Break Type (if none specified)
        let finalBreakTypeId = breakTypeId;
        let finalBreakTypeName = breakTypeName;

        if (!finalBreakTypeId) {
          const { data: defaultBreakType } = await sbAdmin
            .from('workspace_break_types')
            .select('*')
            .eq('ws_id', wsId)
            .eq('is_default', true)
            .maybeSingle();

          if (defaultBreakType) {
            finalBreakTypeId = defaultBreakType.id;
            finalBreakTypeName = defaultBreakType.name;
          }
        }

        // Create break record (completed when resumed)
        const { error: breakError } = await sbAdmin
          .from('time_tracking_breaks')
          .insert({
            session_id: sessionId, // Link to the paused session
            break_type_id: finalBreakTypeId || null,
            break_type_name: finalBreakTypeName || 'Break',
            break_start: endTime,
            break_end: null, // Set when resumed
            created_by: user.id,
          });

        if (breakError) {
          console.error('Failed to create break record:', breakError);
          // Rollback: restore session to running state
          await sbAdmin
            .from('time_tracking_sessions')
            .update({
              end_time: null,
              duration_seconds: null,
              is_running: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
          return NextResponse.json(
            { error: 'Failed to create break record' },
            { status: 500 }
          );
        }

        // Use the RPC function to pause the session with the bypass flag set
        // This bypasses the trigger's threshold check for break pauses
        // pendingApproval=true marks session as awaiting approval (won't show in history)
        const { error: rpcError } = await sbAdmin.rpc(
          'pause_session_for_break',
          {
            p_session_id: sessionId,
            p_end_time: endTime,
            p_duration_seconds: durationSeconds,
            p_pending_approval: pendingApproval || false,
          }
        );

        if (rpcError) {
          console.error('RPC pause_session_for_break failed:', rpcError);
          throw rpcError;
        }

        // Fetch the full session with relations
        const { data: fullSession, error: fetchError } = await sbAdmin
          .from('time_tracking_sessions')
          .select(`
            *,
            category:time_tracking_categories(*),
            task:tasks(*)
          `)
          .eq('id', sessionId)
          .single();

        if (fetchError) throw fetchError;

        return NextResponse.json({ session: fullSession });
      }

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
