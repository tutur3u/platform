import { createClient } from '@tuturuuu/supabase/next/server';
import dayjs from 'dayjs';
import { type NextRequest, NextResponse } from 'next/server';
import { calculatePeriodStats } from '@/lib/time-tracker-utils';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function GET(
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

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const userTimezone = url.searchParams.get('timezone') || 'UTC';
    const targetUserId = url.searchParams.get('userId') || user.id;

    // Filter parameters
    const searchQuery = url.searchParams.get('searchQuery');
    const categoryId = url.searchParams.get('categoryId');
    const taskId = url.searchParams.get('taskId');
    const duration = url.searchParams.get('duration');
    const timeOfDay = url.searchParams.get('timeOfDay');
    const projectContext = url.searchParams.get('projectContext');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo are required' },
        { status: 400 }
      );
    }

    // Determine which user's data to fetch
    const queryUserId = targetUserId;

    // If targeting another user, verify they're in the same workspace
    if (targetUserId !== user.id) {
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

    // Fetch ONLY necessary fields for sessions for the period to calculate accurate stats
    // Filter out sessions with pending_approval=true
    let query = supabase
      .from('time_tracking_sessions')
      .select(
        `
        id,
        title,
        start_time,
        end_time,
        duration_seconds,
        category_id,
        task_id,
        category:time_tracking_categories(id, name, color)
      `
      )
      .eq('ws_id', normalizedWsId)
      .eq('user_id', queryUserId)
      .eq('pending_approval', false)
      .gte('start_time', dateFrom)
      .lte('start_time', dateTo);

    // Apply basic filters in SQL
    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }
    if (taskId && taskId !== 'all') {
      query = query.eq('task_id', taskId);
    }
    if (searchQuery) {
      query = query.or(
        `title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
      );
    }

    const { data: sessions, error } = await query;

    if (error) throw error;

    const startOfPeriod = dayjs(dateFrom).tz(userTimezone);
    const endOfPeriod = dayjs(dateTo).tz(userTimezone);

    // Calculate stats using the same logic as the frontend
    // but now on the server with ALL sessions in the period
    let stats = calculatePeriodStats(
      sessions || [],
      startOfPeriod,
      endOfPeriod,
      userTimezone
    );

    // Post-filter by duration, time of day, and project context if requested
    // (These are harder to do in simple SQL with complex logic)
    if (
      (duration && duration !== 'all') ||
      (timeOfDay && timeOfDay !== 'all') ||
      (projectContext && projectContext !== 'all')
    ) {
      const postFilteredSessions = (sessions || []).filter((session) => {
        if (duration && duration !== 'all') {
          const d = session.duration_seconds || 0;
          let cat = 'long';
          if (d < 1800) cat = 'short';
          else if (d < 7200) cat = 'medium';

          if (cat !== duration) return false;
        }

        if (timeOfDay && timeOfDay !== 'all') {
          const hour = dayjs.utc(session.start_time).tz(userTimezone).hour();
          let cat = 'night';
          if (hour >= 6 && hour < 12) cat = 'morning';
          else if (hour >= 12 && hour < 18) cat = 'afternoon';
          else if (hour >= 18 && hour < 24) cat = 'evening';

          if (cat !== timeOfDay) return false;
        }

        if (projectContext && projectContext !== 'all') {
          let cat = 'general';
          if (session.task_id) {
            cat = 'project-work';
          } else if (
            session.category?.name?.toLowerCase().includes('meeting')
          ) {
            cat = 'meetings';
          } else if (session.category?.name?.toLowerCase().includes('learn')) {
            cat = 'learning';
          } else if (session.category?.name?.toLowerCase().includes('admin')) {
            cat = 'administrative';
          }

          if (cat !== projectContext) return false;
        }

        return true;
      });

      stats = calculatePeriodStats(
        postFilteredSessions,
        startOfPeriod,
        endOfPeriod,
        userTimezone
      );
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error in period stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
