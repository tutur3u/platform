import { createClient } from '@tuturuuu/supabase/next/server';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { NextResponse } from 'next/server';
import {
  decryptEventsFromStorage,
  encryptEventForStorage,
} from '@/lib/workspace-encryption';

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
    // Query events that overlap with the requested date range
    // Event overlaps if: event_start < end_at AND event_end > start_at
    const query = supabase
      .from('workspace_calendar_events')
      .select('*')
      .eq('ws_id', wsId)
      .lt('start_at', new Date(end_at).toISOString()) // Event starts before range ends
      .gt('end_at', new Date(start_at).toISOString()) // Event ends after range starts
      .order('start_at', { ascending: true });

    const { data: events, error } = await query;

    if (error) throw error;

    // Decrypt encrypted events
    const decryptedEvents = await decryptEventsFromStorage(events || [], wsId);

    return NextResponse.json({
      data: decryptedEvents,
      count: decryptedEvents.length,
    });
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

    // Encrypt sensitive fields
    const encryptedFields = await encryptEventForStorage(wsId, {
      title: event.title || '',
      description: event.description || '',
      location: event.location,
    });

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .insert({
        title: encryptedFields.title,
        description: encryptedFields.description,
        start_at: event.start_at,
        end_at: event.end_at,
        color: event.color || 'blue',
        locked: event.locked || false,
        ws_id: wsId,
        is_encrypted: encryptedFields.is_encrypted,
      })
      .select()
      .single();

    if (error) throw error;

    // Return decrypted data to client
    return NextResponse.json(
      {
        ...data,
        title: event.title || '',
        description: event.description || '',
        location: event.location,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Calendar events API error:', error);
    return NextResponse.json(
      { error: 'An error occurred while processing your request' },
      { status: 500 }
    );
  }
}
