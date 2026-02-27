import {
  getProjectContextCategory,
  getTimeOfDayCategory,
} from '@tuturuuu/hooks/utils/time-tracker-utils';
import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  escapeLikePattern,
  sanitizeSearchQuery,
} from '@tuturuuu/utils/search-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  getWorkspaceConfig,
  isPersonalWorkspace,
  normalizeWorkspaceId,
} from '@/lib/workspace-helper';

dayjs.extend(utc);
dayjs.extend(timezone);

const cursorSchema = z.object({
  lastStartTime: z.iso.datetime({ offset: true }),
  lastId: z.uuid().or(z.string().regex(/^\d+$/)),
});

const sessionCreateSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  taskId: z.uuid().nullable().optional(),
  startTime: z.iso.datetime({ offset: true }).optional(),
  endTime: z.iso.datetime({ offset: true }).optional(),
});

type SessionRequestBody = z.infer<typeof sessionCreateSchema>;

type AdminClient = TypedSupabaseClient;

type MissedEntryPermissionCheckResult =
  | {
      canBypass: boolean;
      thresholdDays: number | null | undefined;
      errorResponse?: never;
    }
  | {
      canBypass?: never;
      thresholdDays?: never;
      errorResponse: NextResponse;
    };

async function checkMissedEntryPermission({
  wsId,
  request,
  sbAdmin,
}: {
  wsId: string;
  request: Request;
  sbAdmin: AdminClient;
}): Promise<MissedEntryPermissionCheckResult> {
  const permissions = await getPermissions({
    wsId,
    request,
  });

  if (!permissions) {
    return {
      errorResponse: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  }

  const { containsPermission } = permissions;
  const canBypass = containsPermission('bypass_time_tracking_request_approval');

  const { data: workspaceSettings, error: workspaceSettingsError } =
    await sbAdmin
      .from('workspace_settings')
      .select('missed_entry_date_threshold')
      .eq('ws_id', wsId)
      .maybeSingle();

  if (workspaceSettingsError) {
    console.error('Failed to load workspace_settings for time-tracking:', {
      wsId,
      error: workspaceSettingsError,
    });

    return {
      errorResponse: NextResponse.json(
        { error: 'Unable to validate workspace settings' },
        { status: 500 }
      ),
    };
  }

  return {
    canBypass,
    thresholdDays: workspaceSettings?.missed_entry_date_threshold,
  };
}

async function handleManualEntry({
  requestBody,
  user,
  normalizedWsId,
  sbAdmin,
  request,
}: {
  requestBody: SessionRequestBody;
  user: { id: string };
  normalizedWsId: string;
  sbAdmin: AdminClient;
  request: Request;
}): Promise<NextResponse> {
  const { title, description, categoryId, taskId, startTime, endTime } =
    requestBody;

  if (!startTime || !endTime) {
    return NextResponse.json(
      { error: 'End time must be after start time' },
      { status: 400 }
    );
  }

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (end <= start) {
    return NextResponse.json(
      { error: 'End time must be after start time' },
      { status: 400 }
    );
  }

  const permissionCheck = await checkMissedEntryPermission({
    wsId: normalizedWsId,
    request,
    sbAdmin,
  });

  if ('errorResponse' in permissionCheck && permissionCheck.errorResponse) {
    return permissionCheck.errorResponse;
  }

  const { canBypass, thresholdDays } = permissionCheck;

  if (!canBypass && thresholdDays !== null && thresholdDays !== undefined) {
    if (thresholdDays === 0) {
      return NextResponse.json(
        {
          error:
            'All missed entries must be submitted as requests for approval',
        },
        { status: 400 }
      );
    }

    const thresholdAgo = new Date();
    thresholdAgo.setDate(thresholdAgo.getDate() - thresholdDays);

    if (start < thresholdAgo) {
      return NextResponse.json(
        {
          error: `Cannot add missed entries older than ${thresholdDays} day${thresholdDays !== 1 ? 's' : ''}. Please submit a request for approval if you need to add older entries.`,
        },
        { status: 400 }
      );
    }
  }

  const durationSeconds = Math.floor((end.getTime() - start.getTime()) / 1000);

  if (durationSeconds < 60) {
    return NextResponse.json(
      { error: 'Session must be at least 1 minute long' },
      { status: 400 }
    );
  }

  const sessionPayload = {
    ws_id: normalizedWsId,
    user_id: user.id,
    title: title?.trim() || '',
    description: description?.trim() || null,
    category_id: categoryId || null,
    task_id: taskId || null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    duration_seconds: durationSeconds,
    is_running: false,
  };

  let insertedId: string;

  if (canBypass) {
    const { data: rpcId, error: rpcError } = await sbAdmin.rpc(
      'insert_time_tracking_session_with_bypass',
      {
        p_ws_id: sessionPayload.ws_id,
        p_user_id: sessionPayload.user_id,
        p_title: sessionPayload.title,
        p_description: sessionPayload.description as string | undefined,
        p_category_id: sessionPayload.category_id as string | undefined,
        p_task_id: sessionPayload.task_id as string | undefined,
        p_start_time: sessionPayload.start_time,
        p_end_time: sessionPayload.end_time,
        p_duration_seconds: sessionPayload.duration_seconds,
        p_is_running: sessionPayload.is_running,
      }
    );

    if (rpcError) {
      if (rpcError.code === 'P0001') {
        return NextResponse.json({ error: rpcError.message }, { status: 400 });
      }
      throw rpcError;
    }

    insertedId = rpcId;
  } else {
    const { data: insertData, error } = await sbAdmin
      .from('time_tracking_sessions')
      .insert(sessionPayload)
      .select('id')
      .single();

    if (error) {
      if (
        error.message?.includes('older than one day is not allowed') ||
        error.message?.includes('must be submitted as requests') ||
        error.code === '23514' ||
        error.code === 'P0001'
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    insertedId = insertData.id;
  }

  const { data, error: fetchError } = await sbAdmin
    .from('time_tracking_sessions')
    .select(
      `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
    )
    .eq('id', insertedId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  return NextResponse.json({ session: data }, { status: 201 });
}

async function createRunningSession({
  requestBody,
  user,
  normalizedWsId,
  sbAdmin,
}: {
  requestBody: SessionRequestBody;
  user: { id: string };
  normalizedWsId: string;
  sbAdmin: AdminClient;
}): Promise<NextResponse> {
  const { title, description, categoryId, taskId } = requestBody;

  const { data: existingRunningSession, error: existingRunningSessionError } =
    await sbAdmin
      .from('time_tracking_sessions')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .eq('is_running', true)
      .maybeSingle();

  if (existingRunningSessionError) {
    console.error('Failed to check existing running session:', {
      wsId: normalizedWsId,
      userId: user.id,
      error: existingRunningSessionError,
    });
    return NextResponse.json(
      { error: 'Failed to prepare running session' },
      { status: 500 }
    );
  }

  const { data: closedSessions, error: closeRunningSessionError } =
    await sbAdmin
      .from('time_tracking_sessions')
      .update({
        end_time: new Date().toISOString(),
        is_running: false,
        updated_at: new Date().toISOString(),
      })
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .eq('is_running', true)
      .select('id');

  if (closeRunningSessionError) {
    console.error('Failed to close existing running session:', {
      wsId: normalizedWsId,
      userId: user.id,
      error: closeRunningSessionError,
    });
    return NextResponse.json(
      { error: 'Failed to close active session' },
      { status: 500 }
    );
  }

  if (existingRunningSession && (closedSessions?.length ?? 0) === 0) {
    console.error('Expected running session close but no rows were updated', {
      wsId: normalizedWsId,
      userId: user.id,
      existingRunningSessionId: existingRunningSession.id,
    });
    return NextResponse.json(
      { error: 'Failed to close active session' },
      { status: 500 }
    );
  }

  const { data, error } = await sbAdmin
    .from('time_tracking_sessions')
    .insert({
      ws_id: normalizedWsId,
      user_id: user.id,
      title: title?.trim() || '',
      description: description?.trim() || null,
      category_id: categoryId || null,
      task_id: taskId || null,
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

  if (error) {
    throw error;
  }

  return NextResponse.json({ session: data }, { status: 201 });
}

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId);

      // Verify workspace access
      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('id:user_id')
        .eq('ws_id', normalizedWsId)
        .eq('user_id', user.id)
        .single();

      if (!memberCheck) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const url = new URL(request.url);
      const type = url.searchParams.get('type') || 'recent';
      const categoryId = url.searchParams.get('categoryId');
      const taskId = url.searchParams.get('taskId');
      const dateFrom = url.searchParams.get('dateFrom');
      const dateTo = url.searchParams.get('dateTo');
      const targetUserId = url.searchParams.get('userId'); // New parameter for viewing other users
      const userTimezone = url.searchParams.get('timezone') || 'UTC';

      // Filter parameters
      const searchQuery = url.searchParams.get('searchQuery');
      const duration = url.searchParams.get('duration');
      const timeOfDay = url.searchParams.get('timeOfDay');
      const projectContext = url.searchParams.get('projectContext');

      const limit = Math.min(
        parseInt(url.searchParams.get('limit') || '10', 10),
        50
      );
      const cursor = url.searchParams.get('cursor');

      // Determine which user's data to fetch (current user or specified user)
      const queryUserId = targetUserId || user.id;

      // If targeting another user, verify they're in the same workspace
      if (targetUserId && targetUserId !== user.id) {
        const { data: targetUserCheck } = await supabase
          .from('workspace_members')
          .select('id:user_id')
          .eq('ws_id', normalizedWsId)
          .eq('user_id', targetUserId)
          .single();

        if (!targetUserCheck) {
          return NextResponse.json(
            { error: 'Target user not found in workspace' },
            { status: 404 }
          );
        }
      }

      if (type === 'running') {
        // Get current running session
        const { data, error } = await supabase
          .from('time_tracking_sessions')
          .select(
            `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
          )
          .eq('ws_id', normalizedWsId)
          .eq('user_id', queryUserId)
          .eq('is_running', true)
          .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ session: data });
      }

      if (type === 'paused') {
        // Find the latest session that has an active break (break_end is null)
        // We must filter by ws_id to ensure we only get breaks for the current workspace
        const { data: activeBreak } = await supabase
          .from('time_tracking_breaks')
          .select(`
          session_id,
          break_start,
          break_type:workspace_break_types(*),
          session:time_tracking_sessions!inner(ws_id)
        `)
          .is('break_end', null)
          .eq('created_by', queryUserId)
          .eq('session.ws_id', normalizedWsId)
          .order('break_start', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!activeBreak) {
          return NextResponse.json({ session: null });
        }

        // Fetch the session with relations
        const { data: session, error } = await supabase
          .from('time_tracking_sessions')
          .select(
            `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
          )
          .eq('id', activeBreak.session_id)
          .eq('ws_id', normalizedWsId)
          .eq('user_id', queryUserId)
          .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
          session: session || null,
          pauseTime: activeBreak.break_start,
          breakType: activeBreak.break_type,
        });
      }

      if (type === 'recent' || type === 'history') {
        // Build query for sessions
        // Filter out sessions with pending_approval=true (they haven't been approved yet)
        let query = supabase
          .from('time_tracking_sessions')
          .select(
            `
          *,
          category:time_tracking_categories(*),
          task:tasks(*)
        `
          )
          .eq('ws_id', normalizedWsId)
          .eq('user_id', queryUserId)
          .eq('pending_approval', false);

        // Build count query with same filters
        let countQuery = supabase
          .from('time_tracking_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('ws_id', normalizedWsId)
          .eq('user_id', queryUserId)
          .eq('pending_approval', false);

        if (type === 'recent') {
          query = query.eq('is_running', false);
          countQuery = countQuery.eq('is_running', false);
        }

        // Apply filters
        if (categoryId && categoryId !== 'all') {
          query = query.eq('category_id', categoryId);
          countQuery = countQuery.eq('category_id', categoryId);
        }

        if (taskId && taskId !== 'all') {
          query = query.eq('task_id', taskId);
          countQuery = countQuery.eq('task_id', taskId);
        }

        const sanitizedSearchQuery = sanitizeSearchQuery(searchQuery);
        if (sanitizedSearchQuery) {
          const escapedSearchQuery = escapeLikePattern(sanitizedSearchQuery);
          const searchPattern = `%${escapedSearchQuery}%`;
          query = query.or(
            `title.ilike.${searchPattern},description.ilike.${searchPattern}`
          );
          countQuery = countQuery.or(
            `title.ilike.${searchPattern},description.ilike.${searchPattern}`
          );
        }

        if (duration && duration !== 'all') {
          if (duration === 'short') {
            query = query.lt('duration_seconds', 1800);
            countQuery = countQuery.lt('duration_seconds', 1800);
          } else if (duration === 'medium') {
            query = query
              .gte('duration_seconds', 1800)
              .lt('duration_seconds', 7200);
            countQuery = countQuery
              .gte('duration_seconds', 1800)
              .lt('duration_seconds', 7200);
          } else if (duration === 'long') {
            query = query.gte('duration_seconds', 7200);
            countQuery = countQuery.gte('duration_seconds', 7200);
          }
        }

        if (dateFrom) {
          query = query.gte('start_time', dateFrom);
          countQuery = countQuery.gte('start_time', dateFrom);
        }

        if (dateTo) {
          query = query.lte('start_time', dateTo);
          countQuery = countQuery.lte('start_time', dateTo);
        }

        // Execute count query
        const { count: total, error: countError } = await countQuery;

        if (countError) throw countError;

        // Apply filters for cursor-based pagination
        if (cursor) {
          const [lastStartTime, lastId] = cursor.split('|');
          const validation = cursorSchema.safeParse({ lastStartTime, lastId });

          if (!validation.success) {
            return NextResponse.json(
              { error: 'Invalid cursor format' },
              { status: 400 }
            );
          }

          const esc = (str: string) =>
            str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          const escapedStartTime = esc(validation.data.lastStartTime);
          const escapedId = esc(validation.data.lastId);

          query = query.or(
            `start_time.lt."${escapedStartTime}",and(start_time.eq."${escapedStartTime}",id.lt."${escapedId}")`
          );
        }

        // Apply pagination and ordering
        const { data, error } = await query
          .order('start_time', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit + 1);

        if (error) throw error;

        let filteredSessions = data || [];

        // Post-filter by time of day and project context if requested
        // (These are harder to do in simple SQL with complex logic)
        if (
          (timeOfDay && timeOfDay !== 'all') ||
          (projectContext && projectContext !== 'all')
        ) {
          filteredSessions = filteredSessions.filter((session) => {
            if (timeOfDay && timeOfDay !== 'all') {
              const cat = getTimeOfDayCategory(
                session.start_time,
                userTimezone
              );
              if (cat !== timeOfDay) return false;
            }

            if (projectContext && projectContext !== 'all') {
              const cat = getProjectContextCategory(session);
              if (cat !== projectContext) return false;
            }

            return true;
          });
        }

        const hasMore = (data?.length || 0) > limit;
        const sessions = hasMore
          ? filteredSessions.slice(0, limit)
          : filteredSessions;
        const lastSession =
          hasMore && data && data[limit - 1] ? data[limit - 1] : null;
        const nextCursor = lastSession
          ? `${lastSession.start_time}|${lastSession.id}`
          : null;

        return NextResponse.json({
          sessions,
          total: total ?? 0,
          hasMore,
          nextCursor,
        });
      }

      if (type === 'stats') {
        const isPersonal = await isPersonalWorkspace(normalizedWsId);

        // Call the optimized RPC function
        const { data, error } = await supabase.rpc('get_time_tracker_stats', {
          p_user_id: queryUserId,
          p_ws_id: normalizedWsId,
          p_is_personal: isPersonal,
          p_timezone: userTimezone,
          p_days_back: 0, // Summary only
        });

        if (error) {
          console.error('Error fetching time tracking stats:', error);
          return NextResponse.json(
            { error: 'Failed to fetch stats' },
            { status: 500 }
          );
        }

        const rawStats = data?.[0];
        if (!rawStats) {
          return NextResponse.json({
            stats: { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 },
          });
        }

        return NextResponse.json({
          stats: {
            todayTime: rawStats.today_time,
            weekTime: rawStats.week_time,
            monthTime: rawStats.month_time,
            streak: rawStats.streak,
          },
        });
      }

      return NextResponse.json(
        { error: 'Invalid type parameter' },
        { status: 400 }
      );
    } catch (error) {
      console.error('Error in time tracking sessions API:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId);

      // Verify workspace access
      const { data: memberCheck } = await supabase
        .from('workspace_members')
        .select('id:user_id')
        .eq('ws_id', normalizedWsId)
        .eq('user_id', user.id)
        .single();

      if (!memberCheck) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }

      const body = await request.json();
      const validation = sessionCreateSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: validation.error.issues },
          { status: 400 }
        );
      }

      const validatedBody = validation.data;
      const { title, startTime, endTime } = validatedBody;

      if (!title?.trim()) {
        return NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        );
      }

      // Use service role client for secure operations
      const sbAdmin = await createAdminClient(); // This should use service role

      const allowFutureSessions =
        (await getWorkspaceConfig(normalizedWsId, 'ALLOW_FUTURE_SESSIONS')) ===
        'true';

      // CRITICAL: Prevent future start times (unless allowed by config)
      const now = new Date();
      if (!allowFutureSessions && startTime) {
        const start = new Date(startTime);
        if (start > now) {
          return NextResponse.json(
            {
              error:
                'Cannot create a time tracking session with a start time in the future.',
            },
            { status: 400 }
          );
        }
      }

      // If this is a manual entry (missed entry), handle differently
      if (startTime && endTime) {
        return handleManualEntry({
          requestBody: validatedBody,
          user,
          normalizedWsId,
          sbAdmin,
          request,
        });
      }

      if ((startTime && !endTime) || (!startTime && endTime)) {
        return NextResponse.json(
          {
            error:
              'Manual entry requires both startTime and endTime, or neither for a running session',
          },
          { status: 400 }
        );
      }

      return createRunningSession({
        requestBody: validatedBody,
        user,
        normalizedWsId,
        sbAdmin,
      });
    } catch (error) {
      console.error('Error creating time tracking session:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
