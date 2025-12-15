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
import { checkE2EEPermission, looksLikeEncryptedData } from '../utils';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * GET - Verify encryption status of events
 * Returns detailed info about encrypted vs unencrypted events
 * Any workspace member can check encryption status
 */
export async function GET(_: Request, { params }: Params) {
  const { wsId } = await params;

  if (!isEncryptionEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: 'E2EE is not enabled on this server',
    });
  }

  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if user has access to this workspace (any member can view status)
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

  // Get sample of events to verify encryption
  const { data: events } = await adminClient
    .from('workspace_calendar_events')
    .select('id, title, is_encrypted')
    .eq('ws_id', wsId)
    .limit(20);

  if (!events || events.length === 0) {
    return NextResponse.json({
      enabled: true,
      totalEvents: 0,
      encryptedCount: 0,
      unencryptedCount: 0,
      verificationStatus: 'no_events',
      message: 'No events to verify',
    });
  }

  // Analyze events to verify encryption
  let trueEncrypted = 0;
  let falseEncrypted = 0;
  let markedEncryptedButPlaintext = 0;
  const samples: Array<{
    id: string;
    is_encrypted: boolean | null;
    titleLooksEncrypted: boolean;
    titlePreview: string;
  }> = [];

  for (const event of events) {
    // Use shared utility for consistent encryption detection
    const titleLooksEncrypted = looksLikeEncryptedData(event.title);

    if (event.is_encrypted) {
      if (titleLooksEncrypted) {
        trueEncrypted++;
      } else {
        markedEncryptedButPlaintext++;
      }
    } else {
      falseEncrypted++;
    }

    samples.push({
      id: event.id,
      is_encrypted: event.is_encrypted,
      titleLooksEncrypted,
      titlePreview:
        event.title?.substring(0, 30) + (event.title?.length > 30 ? '...' : ''),
    });
  }

  return NextResponse.json({
    enabled: true,
    totalEvents: events.length,
    trueEncrypted,
    falseEncrypted,
    markedEncryptedButPlaintext,
    verificationStatus:
      markedEncryptedButPlaintext > 0
        ? 'integrity_issue'
        : falseEncrypted > 0
          ? 'partial'
          : 'verified',
    samples,
    message:
      markedEncryptedButPlaintext > 0
        ? `Warning: ${markedEncryptedButPlaintext} events marked encrypted but contain plaintext`
        : falseEncrypted > 0
          ? `${falseEncrypted} events still unencrypted`
          : 'All sampled events properly encrypted',
  });
}

/**
 * POST - Encrypt all unencrypted calendar events in the workspace
 * Requires manage_e2ee permission
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

  // Check if user has manage_e2ee permission
  const { authorized, user, reason } = await checkE2EEPermission(
    supabase,
    wsId
  );

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!authorized) {
    return NextResponse.json(
      {
        error:
          reason === 'not_a_member'
            ? 'You are not a member of this workspace'
            : 'You do not have permission to manage E2EE settings',
      },
      { status: 403 }
    );
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
  const workspaceKey = await decryptWorkspaceKey(encryptedKeyString, masterKey);

  // Get all unencrypted events
  const { data: events, error: fetchError } = await adminClient
    .from('workspace_calendar_events')
    .select('id, title, description, location')
    .eq('ws_id', wsId)
    .or('is_encrypted.is.null,is_encrypted.eq.false');

  if (fetchError) {
    console.error('Failed to fetch unencrypted events:', fetchError);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }

  if (!events || events.length === 0) {
    return NextResponse.json({
      success: true,
      migratedCount: 0,
      message: 'No unencrypted events to migrate',
    });
  }

  // Encrypt each event
  let migratedCount = 0;
  let errorCount = 0;

  for (const event of events) {
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
        console.error(`Failed to encrypt event ${event.id}:`, updateError);
        errorCount++;
      } else {
        migratedCount++;
      }
    } catch (error) {
      console.error(`Encryption failed for event ${event.id}:`, error);
      errorCount++;
    }
  }

  return NextResponse.json({
    success: errorCount === 0,
    migratedCount,
    errorCount,
    totalEvents: events.length,
    message:
      errorCount === 0
        ? `Successfully encrypted ${migratedCount} events`
        : `Encrypted ${migratedCount} events, ${errorCount} failed`,
  });
}
