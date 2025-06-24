import { createClient } from '@tuturuuu/supabase/next/server';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  // Get the start_at and end_at from the URL
  const url = new URL(request.url);
  const start_at = url.searchParams.get('start_at');
  const end_at = url.searchParams.get('end_at');

  if (!start_at || !end_at) {
    return NextResponse.json(
      { error: 'Start and end dates are required' },
      { status: 400 }
    );
  }

  try {
    const { data: events, error } = await supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId);
    // .lte('start_at', new Date(end_at).toISOString())
    // .gte('end_at', new Date(start_at).toISOString());

    if (error) throw error;

    return NextResponse.json({ data: events, count: events.length });
  } catch (error) {
    console.error('Calendar events API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    const event: Omit<CalendarEvent, 'id'> = await request.json();

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert({
        title: event.title || '',
        description: event.description || '',
        start_at: event.start_at,
        end_at: event.end_at,
        color: event.color || 'blue',
        locked: event.locked || false,
        ws_id: wsId,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Calendar events API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
