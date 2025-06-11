import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch real session data using the database functions
    const [sessionsResult, statsResult] = await Promise.all([
      supabase.rpc('get_user_sessions', { user_id: user.id }),
      supabase.rpc('get_user_session_stats', { user_id: user.id }),
    ]);

    if (sessionsResult.error) {
      console.error('Error fetching sessions:', sessionsResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch sessions' },
        { status: 500 }
      );
    }

    if (statsResult.error) {
      console.error('Error fetching session stats:', statsResult.error);
      return NextResponse.json(
        { error: 'Failed to fetch session statistics' },
        { status: 500 }
      );
    }

    const sessions = sessionsResult.data || [];
    const stats = statsResult.data?.[0] || {
      total_sessions: 0,
      active_sessions: 0,
      current_session_age: null,
    };

    return NextResponse.json({
      sessions,
      stats,
    });
  } catch (error) {
    console.error('Unexpected error in sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Revoke all other sessions using the database function
    const { data: revokedCount, error } = await supabase.rpc(
      'revoke_all_other_sessions',
      {
        user_id: user.id,
      }
    );

    if (error) {
      console.error('Error revoking sessions:', error);
      return NextResponse.json(
        { error: 'Failed to revoke sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      revokedCount: revokedCount || 0,
      message: `Successfully revoked ${revokedCount || 0} other sessions`,
    });
  } catch (error) {
    console.error('Unexpected error in revoke sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
