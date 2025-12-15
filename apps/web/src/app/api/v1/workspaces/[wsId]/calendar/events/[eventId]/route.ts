import { createClient } from '@tuturuuu/supabase/next/server';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { NextResponse } from 'next/server';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
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

    // Get workspace encryption key (read-only, does not auto-create)
    // This ensures encryption only happens if E2EE was explicitly enabled
    const workspaceKey = await getWorkspaceKey(wsId);

    // Check if any sensitive fields are being updated
    const hasSensitiveUpdates =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.location !== undefined;

    // Build update object with only the fields that were provided
    const updatePayload: Record<string, unknown> = {};

    // Handle sensitive fields - only encrypt if they're being updated
    if (hasSensitiveUpdates) {
      const encryptedFields = await encryptEventForStorage(
        wsId,
        {
          title: updates.title ?? '',
          description: updates.description ?? '',
          location: updates.location,
        },
        workspaceKey
      );

      if (updates.title !== undefined) {
        updatePayload.title = encryptedFields.title;
      }
      if (updates.description !== undefined) {
        updatePayload.description = encryptedFields.description;
      }
      if (updates.location !== undefined) {
        updatePayload.location = encryptedFields.location;
      }
      updatePayload.is_encrypted = encryptedFields.is_encrypted;
    }

    // Handle non-sensitive fields - only include if provided
    if (updates.start_at !== undefined) {
      updatePayload.start_at = updates.start_at;
    }
    if (updates.end_at !== undefined) {
      updatePayload.end_at = updates.end_at;
    }
    if (updates.color !== undefined) {
      updatePayload.color = updates.color;
    }
    if (updates.locked !== undefined) {
      updatePayload.locked = updates.locked;
    }

    // Only proceed if there are fields to update
    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided for update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('workspace_calendar_events')
      .update(updatePayload)
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .select()
      .single();

    if (error) throw error;

    // If sensitive fields were updated, return them decrypted
    // Otherwise, decrypt the full event from storage
    if (hasSensitiveUpdates) {
      return NextResponse.json({
        ...data,
        title: updates.title ?? data.title,
        description: updates.description ?? data.description,
        location: updates.location ?? data.location,
      });
    }

    // For non-sensitive updates, decrypt and return the full event
    const decryptedEvent = await decryptEventFromStorage(data, wsId);
    return NextResponse.json(decryptedEvent);
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
