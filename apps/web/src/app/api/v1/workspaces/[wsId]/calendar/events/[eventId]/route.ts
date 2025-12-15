import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  decryptEventFromStorage,
  encryptEventForStorage,
  getWorkspaceKey,
} from '@/lib/workspace-encryption';

const updateEventSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start_at: z.string().datetime().optional(),
  end_at: z.string().datetime().optional(),
  color: z.string().optional(),
  locked: z.boolean().optional(),
});

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

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({}, { status: 404 });
      }
      throw error;
    }

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
    // Validate UUIDs
    try {
      z.string().uuid().parse(wsId);
      z.string().uuid().parse(eventId);
    } catch {
      return NextResponse.json(
        { error: 'Invalid workspace or event ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = updateEventSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validationResult.error },
        { status: 400 }
      );
    }

    const updates = validationResult.data;

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

    // Handle sensitive fields with encryption
    // CRITICAL: When E2EE is enabled and the existing event is NOT encrypted,
    // we must encrypt ALL sensitive fields (not just the updated ones) to avoid
    // a mixed state where is_encrypted=true but some fields remain as plaintext.
    if (hasSensitiveUpdates && workspaceKey) {
      // Fetch the existing event to check its encryption state
      const { data: existingEvent, error: fetchError } = await supabase
        .from('workspace_calendar_events')
        .select('title, description, location, is_encrypted')
        .eq('id', eventId)
        .eq('ws_id', wsId)
        .single();

      if (fetchError) throw fetchError;

      const isCurrentlyEncrypted = existingEvent?.is_encrypted === true;

      // Helper interface for type safety
      interface EncryptableEventFields {
        title: string;
        description: string;
        location?: string | null;
      }

      if (isCurrentlyEncrypted) {
        // Event is already encrypted - only encrypt the updated fields
        // Construct a reduced object with only present updates to avoid encrypting
        // undefined fields as empty strings, which would overwrite existing data
        const fieldsToEncrypt: Partial<EncryptableEventFields> = {};
        if (updates.title !== undefined) fieldsToEncrypt.title = updates.title;
        if (updates.description !== undefined)
          fieldsToEncrypt.description = updates.description;
        if (updates.location !== undefined)
          fieldsToEncrypt.location = updates.location;

        const encryptedFields = await encryptEventForStorage(
          wsId,
          fieldsToEncrypt,
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
        // Keep is_encrypted = true (already encrypted)
        updatePayload.is_encrypted = true;
      } else {
        // Event is NOT encrypted but E2EE is enabled for workspace
        // Must encrypt ALL sensitive fields to avoid mixed plaintext/encrypted state
        // Decrypt existing fields first (they're plaintext, so just use as-is)
        const encryptedFields = await encryptEventForStorage(
          wsId,
          {
            title: updates.title ?? existingEvent?.title ?? '',
            description:
              updates.description ?? existingEvent?.description ?? '',
            location: updates.location ?? existingEvent?.location ?? undefined,
          },
          workspaceKey
        );

        // Always update all sensitive fields when transitioning to encrypted
        updatePayload.title = encryptedFields.title;
        updatePayload.description = encryptedFields.description;
        updatePayload.location = encryptedFields.location;
        updatePayload.is_encrypted = true;
      }
    } else if (hasSensitiveUpdates) {
      // No encryption key available - check if the existing event is encrypted
      // to avoid data corruption (encrypted fields becoming unreadable gibberish)
      const { data: existingEvent, error: fetchError } = await supabase
        .from('workspace_calendar_events')
        .select('is_encrypted')
        .eq('id', eventId)
        .eq('ws_id', wsId)
        .single();

      if (fetchError) throw fetchError;

      if (existingEvent?.is_encrypted === true) {
        // CRITICAL: Cannot update an encrypted event without the encryption key
        // If we proceeded, we'd either:
        // 1. Set is_encrypted=false but leave non-updated fields as encrypted blobs (data corruption)
        // 2. Or only update some fields while others remain encrypted (inconsistent state)
        return NextResponse.json(
          {
            error:
              'Cannot update encrypted event: encryption key unavailable. Please contact your workspace administrator.',
            code: 'E2EE_KEY_UNAVAILABLE',
          },
          { status: 400 }
        );
      }

      // Event is not encrypted - safe to update as plaintext
      if (updates.title !== undefined) {
        updatePayload.title = updates.title;
      }
      if (updates.description !== undefined) {
        updatePayload.description = updates.description;
      }
      if (updates.location !== undefined) {
        updatePayload.location = updates.location;
      }
      // is_encrypted remains false (event was never encrypted)
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

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Event not found or not updated' },
          { status: 404 }
        );
      }
      throw error;
    }

    // If sensitive fields were updated, we need to return decrypted values
    // For fields not updated, we must decrypt the stored (encrypted) values first
    if (hasSensitiveUpdates) {
      // Decrypt the stored event to get plaintext for any fields not in updates
      const decryptedStored = await decryptEventFromStorage(data, wsId);

      return NextResponse.json({
        ...data,
        // Use update value if provided, otherwise use decrypted stored value
        title: updates.title ?? decryptedStored.title,
        description: updates.description ?? decryptedStored.description,
        location: updates.location ?? decryptedStored.location,
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
