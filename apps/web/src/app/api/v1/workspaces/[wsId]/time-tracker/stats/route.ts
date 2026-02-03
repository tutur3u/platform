import { createClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  userId: process.env.NODE_ENV === 'development' ? z.string() : z.uuid(),
  isPersonal: z.enum(['true', 'false']).transform((val) => val === 'true'),
  timezone: z.string().default('UTC'),
  summaryOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  daysBack: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 365)),
});

const dailyActivitySchema = z.object({
  date: z.string(),
  duration: z.number(),
  sessions: z.number(),
});

const statsSchema = z.object({
  today_time: z.number(),
  week_time: z.number(),
  month_time: z.number(),
  streak: z.number(),
  daily_activity: z.array(dailyActivitySchema),
});

type TimeTrackerStatsResponse = z.infer<typeof statsSchema>;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const result = querySchema.safeParse(searchParams);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', issues: result.error.issues },
        { status: 400 }
      );
    }

    const { userId, isPersonal, timezone, summaryOnly, daysBack } = result.data;

    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (
      process.env.NODE_ENV !== 'development' &&
      (authError || !user || user.id !== userId)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the database function to get pre-calculated stats with timezone awareness
    const { data, error } = await supabase.rpc('get_time_tracker_stats', {
      p_user_id: userId,
      p_ws_id: normalizedWsId,
      p_is_personal: isPersonal,
      p_timezone: timezone,
      p_days_back: summaryOnly ? 0 : daysBack,
    });

    if (error) {
      console.error('Error fetching time tracking stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch time tracking stats' },
        { status: 500 }
      );
    }

    // The RPC returns an array with a single row
    const rawStats = data?.[0];
    const statsResult = statsSchema.safeParse(rawStats);

    if (!statsResult.success) {
      if (rawStats) {
        console.error(
          'Time tracker stats validation failed:',
          statsResult.error.flatten()
        );
      }
      return NextResponse.json({
        todayTime: 0,
        weekTime: 0,
        monthTime: 0,
        streak: 0,
        dailyActivity: [],
      });
    }

    const stats: TimeTrackerStatsResponse = statsResult.data;

    return NextResponse.json({
      todayTime: stats.today_time,
      weekTime: stats.week_time,
      monthTime: stats.month_time,
      streak: stats.streak,
      dailyActivity: stats.daily_activity,
    });
  } catch (error) {
    console.error('Error in time tracker stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
