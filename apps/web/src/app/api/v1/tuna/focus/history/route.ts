/**
 * Tuna Focus History API
 * GET /api/v1/tuna/focus/history - Get detailed focus session history
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '20', 10),
      100
    );
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const completedOnly = searchParams.get('completed_only') === 'true';

    // Build query
    let query = supabase
      .from('tuna_focus_sessions')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (completedOnly) {
      query = query.eq('completed', true);
    }

    const { data: sessions, error, count } = await query;

    if (error) {
      console.error('Error getting focus history:', error);
      return NextResponse.json(
        { error: 'Failed to get focus history' },
        { status: 500 }
      );
    }

    // Get daily aggregates for the past 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: dailyData } = await supabase
      .from('tuna_daily_stats')
      .select('date, focus_minutes, focus_sessions_completed')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false });

    // Calculate weekly and monthly totals
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weekData = (dailyData || []).filter(
      (d) => new Date(d.date) >= weekAgo
    );
    const monthData = dailyData || []; // Last 30 days from query

    const weekStats = {
      total_minutes: weekData.reduce((sum, d) => sum + d.focus_minutes, 0),
      total_sessions: weekData.reduce(
        (sum, d) => sum + d.focus_sessions_completed,
        0
      ),
      avg_daily_minutes: Math.round(
        weekData.reduce((sum, d) => sum + d.focus_minutes, 0) / 7
      ),
    };

    const monthStats = {
      total_minutes: monthData.reduce((sum, d) => sum + d.focus_minutes, 0),
      total_sessions: monthData.reduce(
        (sum, d) => sum + d.focus_sessions_completed,
        0
      ),
      avg_daily_minutes: Math.round(
        monthData.reduce((sum, d) => sum + d.focus_minutes, 0) / 30
      ),
    };

    return NextResponse.json({
      sessions: sessions || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        has_more: (count || 0) > offset + limit,
      },
      daily_data: dailyData || [],
      week_stats: weekStats,
      month_stats: monthStats,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/tuna/focus/history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
