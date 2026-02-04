import { createClient } from '@tuturuuu/supabase/next/server';
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
  calculatePeriodStats,
  getProjectContextCategory,
  getTimeOfDayCategory,
} from '@/lib/time-tracker-utils';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

dayjs.extend(utc);
dayjs.extend(timezone);

const timezoneEnumValues = (() => {
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    const timezones = Intl.supportedValuesOf('timeZone');
    if (timezones.includes('UTC')) return timezones;
    return ['UTC', ...timezones];
  }
  return ['UTC'];
})();

const isoDateSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const querySchema = z
  .object({
    dateFrom: isoDateSchema,
    dateTo: isoDateSchema,
    timezone: z
      .enum(timezoneEnumValues as [string, ...string[]])
      .default('UTC'),
    targetUserId: z.string().min(1).optional(),
    searchQuery: z.string().optional(),
    categoryId: z.string().optional(),
    taskId: z.string().optional(),
    duration: z.enum(['all', 'short', 'medium', 'long']).optional(),
    timeOfDay: z
      .enum(['all', 'morning', 'afternoon', 'evening', 'night'])
      .optional(),
    projectContext: z
      .enum([
        'all',
        'project-work',
        'meetings',
        'learning',
        'administrative',
        'general',
      ])
      .optional(),
  })
  .refine((data) => data.dateFrom <= data.dateTo, {
    message: 'dateFrom must be before or equal to dateTo',
    path: ['dateFrom'],
  });

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
    const parsedQuery = querySchema.safeParse({
      dateFrom: url.searchParams.get('dateFrom'),
      dateTo: url.searchParams.get('dateTo'),
      timezone: url.searchParams.get('timezone') ?? 'UTC',
      targetUserId: url.searchParams.get('userId') ?? undefined,
      searchQuery: url.searchParams.get('searchQuery') ?? undefined,
      categoryId: url.searchParams.get('categoryId') ?? undefined,
      taskId: url.searchParams.get('taskId') ?? undefined,
      duration: url.searchParams.get('duration') ?? undefined,
      timeOfDay: url.searchParams.get('timeOfDay') ?? undefined,
      projectContext: url.searchParams.get('projectContext') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const {
      dateFrom,
      dateTo,
      timezone: userTimezone,
      targetUserId,
      searchQuery,
      categoryId,
      taskId,
      duration,
      timeOfDay,
      projectContext,
    } = parsedQuery.data;

    const dateFromIso = dateFrom.toISOString();
    const dateToIso = dateTo.toISOString();

    // Determine which user's data to fetch
    const queryUserId = targetUserId ?? user.id;

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
      .lt('start_time', dateToIso)
      .or(`end_time.gte.${dateFromIso},end_time.is.null`);

    // Apply basic filters in SQL
    if (categoryId && categoryId !== 'all') {
      query = query.eq('category_id', categoryId);
    }
    if (taskId && taskId !== 'all') {
      query = query.eq('task_id', taskId);
    }
    const sanitizedSearchQuery = sanitizeSearchQuery(searchQuery);
    if (sanitizedSearchQuery) {
      const escapedSearchQuery = escapeLikePattern(sanitizedSearchQuery);
      const searchPattern = `%${escapedSearchQuery}%`;
      query = query.or(
        `title.ilike.${searchPattern},description.ilike.${searchPattern}`
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
          const cat = getTimeOfDayCategory(session.start_time, userTimezone);
          if (cat !== timeOfDay) return false;
        }

        if (projectContext && projectContext !== 'all') {
          const cat = getProjectContextCategory(session);
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
