import { sanitizeSearchQuery } from '@tuturuuu/utils/search-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const timezoneEnumValues = (() => {
  if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
    const timezones = Intl.supportedValuesOf('timeZone');
    if (timezones.includes('UTC')) return timezones;
    return ['UTC', ...timezones];
  }
  return ['UTC'];
})();

const isoDateSchema = z.iso
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

const periodStatsSchema = z.object({
  totalDuration: z.number().nullable().optional(),
  breakdown: z
    .array(
      z.object({
        name: z.string(),
        duration: z.number(),
        color: z.string(),
      })
    )
    .nullable()
    .optional(),
  timeOfDayBreakdown: z
    .object({
      morning: z.number(),
      afternoon: z.number(),
      evening: z.number(),
      night: z.number(),
    })
    .nullable()
    .optional(),
  bestTimeOfDay: z.string().nullable().optional(),
  longestSession: z
    .object({
      title: z.string(),
      duration_seconds: z.number(),
    })
    .nullable()
    .optional(),
  shortSessions: z.number().nullable().optional(),
  mediumSessions: z.number().nullable().optional(),
  longSessions: z.number().nullable().optional(),
  sessionCount: z.number().nullable().optional(),
  dailyBreakdown: z
    .array(
      z.object({
        date: z.string(),
        totalDuration: z.number(),
        breakdown: z.array(
          z.object({
            categoryId: z.string(),
            name: z.string(),
            duration: z.number(),
            color: z.string(),
          })
        ),
      })
    )
    .nullable()
    .optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const { data: authData, error: authError } =
      await authorizeRequest(request);
    if (authError || !authData) {
      return (
        authError ??
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }

    const { user, supabase } = authData;

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

    const sanitizedSearchQuery = sanitizeSearchQuery(searchQuery);

    const { data: stats, error } = await supabase.rpc(
      'get_time_tracking_period_stats',
      {
        p_ws_id: normalizedWsId,
        p_user_id: queryUserId,
        p_date_from: dateFromIso,
        p_date_to: dateToIso,
        p_timezone: userTimezone,
        p_category_id:
          categoryId && categoryId !== 'all' ? categoryId : undefined,
        p_task_id: taskId && taskId !== 'all' ? taskId : undefined,
        p_search_query: sanitizedSearchQuery || undefined,
        p_duration: duration && duration !== 'all' ? duration : undefined,
        p_time_of_day: timeOfDay && timeOfDay !== 'all' ? timeOfDay : undefined,
        p_project_context:
          projectContext && projectContext !== 'all'
            ? projectContext
            : undefined,
      }
    );

    if (error) throw error;

    const parsedStats = periodStatsSchema.safeParse(stats ?? {});

    if (!parsedStats.success) {
      console.error('Period stats validation failed:', parsedStats.error);
    }

    const data = parsedStats.success ? parsedStats.data : null;

    const normalizedStats = {
      totalDuration: data?.totalDuration ?? 0,
      breakdown: data?.breakdown ?? [],
      timeOfDayBreakdown: data?.timeOfDayBreakdown ?? {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0,
      },
      bestTimeOfDay: data?.bestTimeOfDay ?? 'none',
      longestSession: data?.longestSession ?? null,
      shortSessions: data?.shortSessions ?? 0,
      mediumSessions: data?.mediumSessions ?? 0,
      longSessions: data?.longSessions ?? 0,
      sessionCount: data?.sessionCount ?? 0,
      dailyBreakdown: data?.dailyBreakdown ?? [],
    };

    return NextResponse.json(normalizedStats);
  } catch (error) {
    console.error('Error in period stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
