/**
 * Tuna Focus Session Individual API
 * DELETE /api/v1/tuna/focus/[id] - Delete a focus session
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }

    // Check if session exists and belongs to user
    const { data: session, error: fetchError } = await supabase
      .from('tuna_focus_sessions')
      .select('id, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return NextResponse.json(
        { error: 'Focus session not found' },
        { status: 404 }
      );
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete the session and return the deleted row to verify it worked
    const { data: deletedSession, error: deleteError } = await supabase
      .from('tuna_focus_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (deleteError) {
      console.error('Error deleting focus session:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete focus session' },
        { status: 500 }
      );
    }

    // Verify deletion actually happened (RLS might silently block it)
    if (!deletedSession) {
      return NextResponse.json(
        { error: 'Failed to delete focus session - operation not permitted' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, deleted_id: deletedSession.id });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/v1/tuna/focus/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
