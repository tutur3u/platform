import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');

  if (!challengeId) {
    return NextResponse.json(
      { message: 'Challenge ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get total sessions count for this challenge and user
    const { count: totalCount, error: totalError } = await supabase
      .from('nova_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id);

    if (totalError) {
      console.error('Error counting total sessions:', totalError);
      return NextResponse.json(
        { message: 'Error counting sessions' },
        { status: 500 }
      );
    }

    // Get daily sessions count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: dailyCount, error: dailyError } = await supabase
      .from('nova_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('challenge_id', challengeId)
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString());

    if (dailyError) {
      console.error('Error counting daily sessions:', dailyError);
      return NextResponse.json(
        { message: 'Error counting daily sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        total: totalCount || 0,
        daily: dailyCount || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
