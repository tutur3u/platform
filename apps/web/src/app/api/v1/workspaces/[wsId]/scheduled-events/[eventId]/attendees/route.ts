import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextRequest, NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    eventId: string;
  }>;
}

// POST /api/v1/workspaces/[wsId]/scheduled-events/[eventId]/attendees
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId, eventId } = await params;
    const supabase = await createClient();
    const user = await getCurrentUser(true);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { withoutPermission } = await getPermissions({ wsId });
    if (withoutPermission('manage_calendar')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Check if user is the creator of the event
    const { data: existingEvent, error: checkError } = await supabase
      .from('workspace_scheduled_events')
      .select('creator_id')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (checkError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (existingEvent.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only event creators can manage attendees' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { user_ids } = body ?? {};
    if (!Array.isArray(user_ids)) {
      return NextResponse.json({ error: 'user_ids must be an array' }, { status: 400 });
    }
    // Keep only string ids, dedupe, and exclude the creator
    const uniqueIds = [...new Set(user_ids.filter((id: unknown) => typeof id === 'string'))] as string[];
    const filteredIds = uniqueIds.filter((id) => id !== user.id);
    if (filteredIds.length === 0) {
      return NextResponse.json(
        { error: 'user_ids must contain at least one non-creator user id' },
        { status: 400 }
      );
    }

    // Add attendees
    const attendeesToAdd = user_ids.map((userId: string) => ({
      event_id: eventId,
      user_id: userId,
      status: 'pending',
      created_at: new Date().toISOString(),
    }));

    const { data: addedAttendees, error: addError } = await supabase
      .from('event_attendees')
      .upsert(attendeesToAdd, { onConflict: 'event_id,user_id', ignoreDuplicates: true })
      .select();

      if (addError) {
        console.error('Error adding attendees:', addError);
        const msg = (addError as any)?.code === '23505' ? 'Some attendees are already added' : 'Failed to add attendees';
        const status = (addError as any)?.code === '23505' ? 409 : 500;
        return NextResponse.json({ error: msg }, { status });
      }

    return NextResponse.json(addedAttendees, { status: 201 });
  } catch (error) {
    console.error('Error in attendees POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
