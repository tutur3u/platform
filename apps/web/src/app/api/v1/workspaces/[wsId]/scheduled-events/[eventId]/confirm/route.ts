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

// POST /api/v1/workspaces/[wsId]/scheduled-events/[eventId]/confirm
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
      .select('creator_id, status')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (checkError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (existingEvent.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only event creators can confirm events' },
        { status: 403 }
      );
    }

    // Check if event is already confirmed
    if (existingEvent.status === 'confirmed') {
      return NextResponse.json(
        { error: 'Event is already confirmed' },
        { status: 400 }
      );
    }

    // Only active and draft events can be confirmed
    if (!['active', 'draft'].includes(existingEvent.status || 'active')) {
      return NextResponse.json(
        { error: 'Only active or draft events can be confirmed' },
        { status: 400 }
      );
    }

    // Update the event status to confirmed
    const { data: updatedEvent, error: updateError } = await supabase
      .from('workspace_scheduled_events')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .in('status', ['active', 'draft'])
      .select()
      .single();

    if (updateError) {
      console.error('Error confirming event:', updateError);
      return NextResponse.json(
        { error: 'Failed to confirm event' },
        { status: 500 }
      );
    }

    if (!updatedEvent) {
      return NextResponse.json(
        { error: 'Event status changed; please refresh and retry' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: 'Event confirmed successfully',
      event: updatedEvent,
    });
  } catch (error) {
    console.error('Error in event confirm POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/v1/workspaces/[wsId]/scheduled-events/[eventId]/confirm
export async function DELETE(req: NextRequest, { params }: Params) {
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
      .select('creator_id, status')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (checkError || !existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (existingEvent.creator_id !== user.id) {
      return NextResponse.json(
        { error: 'Only event creators can unconfirm events' },
        { status: 403 }
      );
    }

    // Check if event is confirmed
    if (existingEvent.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'Event is not confirmed' },
        { status: 400 }
      );
    }

    // Revert the event status back to active
    const { data: updatedEvent, error: updateError } = await supabase
      .from('workspace_scheduled_events')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .eq('status', 'confirmed')
      .select()
      .single();

    if (updateError) {
      console.error('Error unconfirming event:', updateError);
      return NextResponse.json(
        { error: 'Failed to unconfirm event' },
        { status: 500 }
      );
    }

    if (!updatedEvent) {
      return NextResponse.json(
        { error: 'Event status changed; please refresh and retry' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      message: 'Event confirmation removed successfully',
      event: updatedEvent,
    });
  } catch (error) {
    console.error('Error in event confirm DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
