import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; meetingId: string }> }
) {
  try {
    const { wsId: rawWsId, meetingId } = await params;

    // Get authenticated user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { supabase, user } = auth;

    // Aliases like 'personal' are not UUIDs, so the membership lookup errors
    // out and reports membership_lookup_failed instead of a real answer.
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Verify the meeting exists and belongs to this workspace
    const { data: existingMeeting } = await supabase
      .from('workspace_meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!existingMeeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, time } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate name length and content
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return NextResponse.json(
        { error: 'Name cannot be empty' },
        { status: 400 }
      );
    }
    if (trimmedName.length > 255) {
      return NextResponse.json(
        { error: 'Name is too long (max 255 characters)' },
        { status: 400 }
      );
    }

    // Validate time if provided
    let validatedTime: string;
    if (time) {
      const parsedTime = new Date(time);
      if (Number.isNaN(parsedTime.getTime())) {
        return NextResponse.json(
          { error: 'Invalid time format' },
          { status: 400 }
        );
      }
      validatedTime = parsedTime.toISOString();
    } else {
      validatedTime = new Date().toISOString();
    }

    // Update the meeting
    const { data: meeting, error } = await supabase
      .from('workspace_meetings')
      .update({
        name,
        time: validatedTime,
      })
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .select(
        `
        *,
        creator:users!workspace_meetings_creator_id_fkey(
          display_name
        )
      `
      )
      .single();

    if (error) {
      console.error('Error updating meeting:', error);
      return NextResponse.json(
        { error: 'Failed to update meeting' },
        { status: 500 }
      );
    }

    return NextResponse.json({ meeting });
  } catch (error) {
    console.error('Error in meetings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; meetingId: string }> }
) {
  try {
    const { wsId: rawWsId, meetingId } = await params;

    // Get authenticated user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) {
      return auth.response;
    }
    const { supabase, user } = auth;

    // Aliases like 'personal' are not UUIDs, so the membership lookup errors
    // out and reports membership_lookup_failed instead of a real answer.
    const wsId = await normalizeWorkspaceId(rawWsId, supabase);

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Verify the meeting exists and belongs to this workspace
    const { data: existingMeeting } = await supabase
      .from('workspace_meetings')
      .select('*')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .single();

    if (!existingMeeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    // Delete the meeting
    const { error } = await supabase
      .from('workspace_meetings')
      .delete()
      .eq('id', meetingId)
      .eq('ws_id', wsId);

    if (error) {
      console.error('Error deleting meeting:', error);
      return NextResponse.json(
        { error: 'Failed to delete meeting' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in meetings API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
