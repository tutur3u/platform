import { createClient } from '@tuturuuu/supabase/next/server';
import { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    eventId: string;
  }>;
}

export async function GET(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, eventId } = await params;

  try {
    const { data: event, error } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .single();

    if (error) throw error;

    return NextResponse.json(event);
  } catch (error) {
    console.error('Calendar event API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, eventId } = await params;

  try {
    const updates: Partial<CalendarEvent> = await request.json();

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .update({
        title: updates.title,
        description: updates.description,
        start_at: updates.start_at,
        end_at: updates.end_at,
        color: updates.color,
      })
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Calendar event API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId, eventId } = await params;

  try {
    const { error } = await supabase
      .from('workspace_calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('ws_id', wsId);

    if (error) throw error;

    return NextResponse.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Calendar event API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
