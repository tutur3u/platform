import { createClient } from '@tuturuuu/supabase/next/server';
import type { RecordingStatus } from '@tuturuuu/types';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; meetingId: string }> }
) {
  try {
    const { wsId, meetingId } = await params;
    const { searchParams } = new URL(request.url);
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Verify the meeting exists and belongs to this workspace
    const { data: meeting } = await supabase
      .from('workspace_meetings')
      .select('id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Parse and validate query parameters
    const statusFilter = searchParams.get('status');
    const limitParam = searchParams.get('limit');

    // Validate status filter
    let statusesToFilter: RecordingStatus[] = [];
    if (statusFilter) {
      const { data: validStatuses, error: validStatusesError } = await supabase
        .from('recording_sessions')
        .select('status');

      if (validStatusesError) {
        return NextResponse.json(
          { error: 'Failed to fetch valid statuses' },
          { status: 500 }
        );
      }

      const requestedStatuses = statusFilter.split(',').map((s) => s.trim());
      const invalidStatuses = requestedStatuses.filter(
        (s) =>
          !validStatuses.map((v) => v.status).includes(s as RecordingStatus)
      );

      if (invalidStatuses.length > 0) {
        return NextResponse.json(
          {
            error: 'Invalid status values',
            invalidStatuses,
            validStatuses: validStatuses.map((v) => v.status),
          },
          { status: 400 }
        );
      }

      statusesToFilter = requestedStatuses as RecordingStatus[];
    }

    // Validate limit parameter
    let limit: number | undefined;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return NextResponse.json(
          { error: 'Invalid limit. Must be a number between 1 and 100' },
          { status: 400 }
        );
      }
      limit = parsedLimit;
    }

    // Build query
    let query = supabase
      .from('recording_sessions')
      .select(
        `
        id,
        status,
        created_at,
        updated_at,
        transcript: recording_transcripts(*)
      `
      )
      .eq('meeting_id', meetingId)
      .not('status', 'eq', 'recording')
      .order('created_at', { ascending: false });

    // Apply status filter
    if (statusesToFilter.length > 0) {
      query = query.in('status', statusesToFilter);
    }

    // Apply limit
    if (limit) {
      query = query.limit(limit);
    }

    // Execute query
    const { data: sessions, error: sessionsError } = await query;

    if (sessionsError) {
      console.error('Error fetching recording sessions:', sessionsError);
      return NextResponse.json(
        { error: 'Failed to fetch recording sessions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessions: sessions || [],
    });
  } catch (error) {
    console.error('Error in recording sessions API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
