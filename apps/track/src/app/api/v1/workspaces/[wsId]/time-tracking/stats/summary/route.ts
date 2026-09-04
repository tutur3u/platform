import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_COLOR_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const querySchema = z.object({
  daysBack: z.coerce.number().int().min(0).max(3660).default(365),
  summaryOnly: z.enum(['true', 'false']).optional(),
  timezone: z.string().max(MAX_SHORT_TEXT_LENGTH).default('UTC'),
  userId: z.guid().optional(),
});

const statsSchema = z.object({
  daily_activity: z.array(
    z.object({
      date: z.string().max(MAX_COLOR_LENGTH),
      duration: z.number(),
      sessions: z.number(),
    })
  ),
  month_time: z.number(),
  streak: z.number(),
  today_time: z.number(),
  week_time: z.number(),
});

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const parsedQuery = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams)
    );
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    if (parsedQuery.data.userId && parsedQuery.data.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase, request);
    const membership = await verifyWorkspaceMembershipType({
      supabase,
      userId: user.id,
      wsId: normalizedWsId,
    });
    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }
    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { data: workspace, error: workspaceError } = await sbAdmin
      .from('workspaces')
      .select('personal')
      .eq('id', normalizedWsId)
      .maybeSingle();
    if (workspaceError) {
      console.error('Failed to resolve time tracking stats workspace:', {
        error: workspaceError,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to fetch time tracking stats' },
        { status: 500 }
      );
    }

    const { daysBack, summaryOnly, timezone } = parsedQuery.data;
    const { data, error } = await sbAdmin.rpc('get_time_tracker_stats', {
      p_days_back: summaryOnly === 'true' ? 0 : daysBack,
      p_is_personal: workspace?.personal ?? false,
      p_timezone: timezone,
      p_user_id: user.id,
      p_ws_id: normalizedWsId,
    });
    if (error) {
      console.error('Failed to fetch time tracking stats:', {
        error,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to fetch time tracking stats' },
        { status: 500 }
      );
    }

    const parsedStats = statsSchema.safeParse(data?.[0]);
    if (!parsedStats.success) {
      if (data?.[0]) {
        console.error('Time tracking stats validation failed:', {
          error: parsedStats.error.flatten(),
          wsId: normalizedWsId,
        });
      }
      return NextResponse.json({
        dailyActivity: [],
        monthTime: 0,
        streak: 0,
        todayTime: 0,
        weekTime: 0,
      });
    }

    const stats = parsedStats.data;
    return NextResponse.json({
      dailyActivity: stats.daily_activity,
      monthTime: stats.month_time,
      streak: stats.streak,
      todayTime: stats.today_time,
      weekTime: stats.week_time,
    });
  },
  {
    allowAppSessionAuth: { targetApp: 'track' },
    cache: { maxAge: 60, swr: 60 },
  }
);
