import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function DELETE(_: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Revoke the specific session using the database function
    const { error } = await supabase.rpc('revoke_user_session', {
      target_user_id: user.id,
      session_id: sessionId,
    });

    if (error) {
      console.error('Error revoking session:', error);
      return NextResponse.json(
        { error: 'Failed to revoke session' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session revoked successfully',
    });
  } catch (error) {
    console.error('Unexpected error in revoke session API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
