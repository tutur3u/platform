import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  escapeLikePattern,
  sanitizeSearchQuery,
} from '@tuturuuu/utils/search-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getProjectContextCategory,
  getTimeOfDayCategory,
} from '@/lib/time-tracker-utils';
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const authHeader =
      request.headers.get('authorization') ??
      request.headers.get('Authorization');
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.replace('Bearer ', '').trim()
      : undefined;

    let supabase = await createClient();
    let user: SupabaseUser | null = null;

    if (accessToken) {
      const adminClient = await createAdminClient({ noCookie: true });
      const {
        data: { user: tokenUser },
        error: tokenError,
      } = await adminClient.auth.getUser(accessToken);

      if (tokenError || !tokenUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      user = tokenUser;
      supabase = adminClient;
    } else {
      // Get authenticated user from cookies
      const {
        data: { user: cookieUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !cookieUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      user = cookieUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
            const cat = getTimeOfDayCategory(session.start_time, userTimezone);
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
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
    const { title, description, categoryId, taskId, startTime, endTime } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
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
      // Validate time range
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (end <= start) {
        return NextResponse.json(
          { error: 'End time must be after start time' },
          { status: 400 }
        );
      }

      // Only apply threshold restrictions for non-personal workspaces
      // Fetch workspace threshold setting
      const { data: workspaceSettings } = await sbAdmin
        .from('workspace_settings')
        .select('missed_entry_date_threshold')
        .eq('ws_id', normalizedWsId)
        .maybeSingle();

      // null/undefined means no approval needed - skip all threshold checks
      const thresholdDays = workspaceSettings?.missed_entry_date_threshold;

      // Only apply restrictions if threshold is explicitly set (not null)
      if (thresholdDays !== null && thresholdDays !== undefined) {
        // If threshold is 0, all missed entries must go through request flow
        if (thresholdDays === 0) {
          return NextResponse.json(
            {
              error:
                'All missed entries must be submitted as requests for approval',
            },
            { status: 400 }
          );
        }

        // Check if start time is older than threshold days
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

      // Calculate duration in seconds
      const durationSeconds = Math.floor(
        (end.getTime() - start.getTime()) / 1000
      );

      if (durationSeconds < 60) {
        return NextResponse.json(
          { error: 'Session must be at least 1 minute long' },
          { status: 400 }
        );
      }

      // Create completed session (not running)
      const { data, error } = await sbAdmin
        .from('time_tracking_sessions')
        .insert({
          ws_id: normalizedWsId,
          user_id: user.id,
          title: title.trim(),
          description: description?.trim() || null,
          category_id: categoryId || null,
          task_id: taskId || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_seconds: durationSeconds,
          is_running: false,
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
        // Check if error is from the trigger restriction
        if (
          error.message?.includes('older than one day is not allowed') ||
          error.code === '23514'
        ) {
          return NextResponse.json(
            {
              error:
                'Cannot add missed entries older than 1 day. Please contact support if you need to add older entries. ',
            },
            { status: 400 }
          );
        }
        throw error;
      }

      return NextResponse.json({ session: data }, { status: 201 });
    }

    // Regular session creation (starts running immediately)
    // Stop any existing running sessions
    await sbAdmin
      .from('time_tracking_sessions')
      .update({
        end_time: new Date().toISOString(),
        is_running: false,
        updated_at: new Date().toISOString(),
      })
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .eq('is_running', true);

    // Create new session with server timestamp
    const { data, error } = await sbAdmin
      .from('time_tracking_sessions')
      .insert({
        ws_id: normalizedWsId,
        user_id: user.id,
        title: title.trim(),
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

    if (error) throw error;

    return NextResponse.json({ session: data }, { status: 201 });
  } catch (error) {
    console.error('Error creating time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
