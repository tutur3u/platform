import { createClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import z from 'zod';

const querySchema = z.object({
  userId: z.uuid(),
  isPersonal: z.enum(['true', 'false']).transform((val) => val === 'true'),
  timezone: z.string().default('UTC'),
});

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

    const { userId, isPersonal, timezone } = result.data;

    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the database function to get pre-calculated stats with timezone awareness
    const { data, error } = await supabase.rpc('get_time_tracker_stats', {
      p_user_id: userId,
      p_ws_id: normalizedWsId,
      p_is_personal: isPersonal,
      p_timezone: timezone,
    });

    if (error) {
      console.error('Error fetching time tracking stats:', error);
      return NextResponse.json(
        { error: 'Failed to fetch time tracking stats' },
        { status: 500 }
      );
    }

    // The RPC returns an array with a single row
    const stats = data?.[0];

    if (!stats) {
      return NextResponse.json({
        todayTime: 0,
        weekTime: 0,
        monthTime: 0,
        streak: 0,
        dailyActivity: [],
      });
    }

    return NextResponse.json({
      todayTime: stats.today_time || 0,
      weekTime: stats.week_time || 0,
      monthTime: stats.month_time || 0,
      streak: stats.streak || 0,
      dailyActivity: stats.daily_activity || [],
    });
  } catch (error) {
    console.error('Error in time tracker stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
