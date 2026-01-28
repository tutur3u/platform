/**
 * Tuna Focus Sessions API
 * GET /api/v1/tuna/focus - Get active session and recent history
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    // Get active session (if any)
    const { data: activeSession, error: activeError } = await supabase
      .from('tuna_focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .maybeSingle();

    if (activeError) {
      console.error('Error getting active session:', activeError);
    }

    // Get recent completed sessions
    const { data: recentSessions, error: recentError } = await supabase
      .from('tuna_focus_sessions')
      .select('*')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (recentError) {
      console.error('Error getting recent sessions:', recentError);
    }

    // Calculate stats
    const { data: statsData, error: statsError } = await supabase
      .from('tuna_focus_sessions')
      .select('actual_duration, xp_earned, completed')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null);

    let stats = {
      total_sessions: 0,
      completed_sessions: 0,
      total_minutes: 0,
      total_xp_earned: 0,
      completion_rate: 0,
    };

    if (!statsError && statsData) {
      stats = {
        total_sessions: statsData.length,
        completed_sessions: statsData.filter((s) => s.completed).length,
        total_minutes: statsData.reduce(
          (sum, s) => sum + (s.actual_duration || 0),
          0
        ),
        total_xp_earned: statsData.reduce(
          (sum, s) => sum + (s.xp_earned || 0),
          0
        ),
        completion_rate:
          statsData.length > 0
            ? Math.round(
                (statsData.filter((s) => s.completed).length /
                  statsData.length) *
                  100
              )
            : 0,
      };
    }

    return NextResponse.json({
      active_session: activeSession,
      recent_sessions: recentSessions || [],
      stats,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/tuna/focus:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
