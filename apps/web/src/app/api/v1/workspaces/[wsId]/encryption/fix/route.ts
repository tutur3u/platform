import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  decryptWorkspaceKey,
  encryptCalendarEventFields,
  getMasterKey,
  isEncryptionEnabled,
} from '@tuturuuu/utils/encryption';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * POST - Fix integrity issues (events marked encrypted but contain plaintext)
 * Re-encrypts all events that are marked as encrypted but don't look encrypted
 * Returns streaming response with progress updates
 */
export async function POST(_: Request, { params }: Params) {
  const { wsId } = await params;

  if (!isEncryptionEnabled()) {
    return NextResponse.json(
      { error: 'E2EE is not enabled on this server' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user has access to this workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const adminClient = await createAdminClient();

  // Get workspace encryption key
  const { data: keyRecord } = await adminClient
    .from('workspace_encryption_keys')
    .select('encrypted_key')
    .eq('ws_id', wsId)
    .maybeSingle();

  if (!keyRecord) {
    return NextResponse.json(
      { error: 'Workspace encryption key not found. Enable E2EE first.' },
      { status: 400 }
    );
  }

  // Decrypt the workspace key
  const masterKey = getMasterKey();
  const encryptedKeyString = (keyRecord as unknown as { encrypted_key: string })
    .encrypted_key;
  const workspaceKey = decryptWorkspaceKey(encryptedKeyString, masterKey);

  // Get all events marked as encrypted
  const { data: events, error: fetchError } = await adminClient
    .from('workspace_calendar_events')
    .select('id, title, description, location, is_encrypted')
    .eq('ws_id', wsId)
    .eq('is_encrypted', true);

  if (fetchError) {
    console.error('Failed to fetch events:', fetchError);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }

  if (!events || events.length === 0) {
    return NextResponse.json({
      success: true,
      fixedCount: 0,
      totalCorrupt: 0,
      progress: 100,
      message: 'No encrypted events found',
    });
  }

  // Find events that look like plaintext (not encrypted)
  const corruptEvents = events.filter((event) => {
    // Check if title looks encrypted (base64:base64 pattern)
    const titleLooksEncrypted =
      typeof event.title === 'string' &&
      event.title.includes(':') &&
      /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(event.title);

    return !titleLooksEncrypted;
  });

  if (corruptEvents.length === 0) {
    return NextResponse.json({
      success: true,
      fixedCount: 0,
      totalCorrupt: 0,
      progress: 100,
      message: 'All encrypted events are valid',
    });
  }

  // Use streaming response for progress updates
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fixedCount = 0;
      let errorCount = 0;
      const total = corruptEvents.length;

      // Send initial progress
      controller.enqueue(
        encoder.encode(
          `${JSON.stringify({
            type: 'progress',
            progress: 0,
            current: 0,
            total,
            message: `Starting to fix ${total} events...`,
          })}\n`
        )
      );

      for (let i = 0; i < corruptEvents.length; i++) {
        const event = corruptEvents[i];
        if (!event) continue;

        try {
          const encrypted = encryptCalendarEventFields(
            {
              title: event.title || '',
              description: event.description || '',
              location: event.location || undefined,
            },
            workspaceKey
          );

          const { error: updateError } = await adminClient
            .from('workspace_calendar_events')
            .update({
              title: encrypted.title,
              description: encrypted.description,
              location: encrypted.location ?? null,
              is_encrypted: true,
            })
            .eq('id', event.id);

          if (updateError) {
            console.error(`Failed to fix event ${event.id}:`, updateError);
            errorCount++;
          } else {
            fixedCount++;
          }
        } catch (error) {
          console.error(`Fix failed for event ${event.id}:`, error);
          errorCount++;
        }

        // Send progress update every 5 events or at the end
        if ((i + 1) % 5 === 0 || i === corruptEvents.length - 1) {
          const progress = Math.round(((i + 1) / total) * 100);
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                type: 'progress',
                progress,
                current: i + 1,
                total,
                fixedCount,
                errorCount,
                message: `Encrypting... ${progress}%`,
              })}\n`
            )
          );
        }
      }

      // Send final result
      controller.enqueue(
        encoder.encode(
          `${JSON.stringify({
            type: 'complete',
            success: errorCount === 0,
            fixedCount,
            errorCount,
            totalCorrupt: total,
            progress: 100,
            message:
              errorCount === 0
                ? `Successfully fixed ${fixedCount} corrupt events`
                : `Fixed ${fixedCount} events, ${errorCount} failed`,
          })}\n`
        )
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
