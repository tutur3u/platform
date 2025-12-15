import { createClient } from '@tuturuuu/supabase/next/server';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { NextResponse } from 'next/server';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
} from '@/lib/workspace-encryption';

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

    // Decrypt if encrypted
    const decryptedEvent = await decryptEventFromStorage(event, wsId);

    return NextResponse.json(decryptedEvent);
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

    // Encrypt sensitive fields if they are being updated
    const encryptedFields = await encryptEventForStorage(wsId, {
      title: updates.title || '',
      description: updates.description || '',
      location: updates.location,
    });

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .update({
        title: encryptedFields.title,
        description: encryptedFields.description,
        location: encryptedFields.location,
        start_at: updates.start_at,
        end_at: updates.end_at,
        color: updates.color,
        locked: updates.locked,
        is_encrypted: encryptedFields.is_encrypted,
      })
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) throw error;

    // Return decrypted data to client
    return NextResponse.json({
      ...data,
      title: updates.title || '',
      description: updates.description || '',
      location: updates.location,
    });
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
