import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  encryptWorkspaceKey,
  generateWorkspaceKey,
  getMasterKey,
  isEncryptionEnabled,
} from '@tuturuuu/utils/encryption';
import { NextResponse } from 'next/server';
import { checkE2EEPermission } from './utils';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * GET - Check if E2EE is enabled for this workspace
 * Any workspace member can check E2EE status
 */
export async function GET(_: Request, { params }: Params) {
  const { wsId } = await params;

  // Check if master key is configured
  if (!isEncryptionEnabled()) {
    return NextResponse.json({
      enabled: false,
      hasKey: false,
      reason: 'Master key not configured',
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

  // Check if workspace has an encryption key
  const adminClient = await createAdminClient();
  const { data: keyRecord } = await adminClient
    .from('workspace_encryption_keys')
    .select('id, created_at')
    .eq('ws_id', wsId)
    .maybeSingle();

  // If key exists, count unencrypted events
  let unencryptedCount = 0;
  if (keyRecord) {
    const { count } = await adminClient
      .from('workspace_calendar_events')
      .select('id', { count: 'exact', head: true })
      .eq('ws_id', wsId)
      .or('is_encrypted.is.null,is_encrypted.eq.false');
    unencryptedCount = count || 0;
  }

  return NextResponse.json({
    enabled: true,
    hasKey: !!keyRecord,
    createdAt: keyRecord
      ? (keyRecord as unknown as { created_at: string }).created_at
      : null,
    unencryptedCount,
  });
}

/**
 * POST - Generate a new E2EE key for this workspace
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

  // Check if key already exists
  const { data: existingKey } = await adminClient
    .from('workspace_encryption_keys')
    .select('id')
    .eq('ws_id', wsId)
    .maybeSingle();

  if (existingKey) {
    return NextResponse.json({
      success: true,
      message: 'Encryption key already exists',
      alreadyExists: true,
    });
  }

  // Generate and store new key
  try {
    const masterKey = getMasterKey();
    const newKey = generateWorkspaceKey();
    const encryptedKey = await encryptWorkspaceKey(newKey, masterKey);

    const { error: insertError } = await adminClient
      .from('workspace_encryption_keys')
      .insert({
        ws_id: wsId,
        encrypted_key: encryptedKey,
      } as never);

    if (insertError) {
      console.error('Failed to create workspace encryption key:', insertError);
      return NextResponse.json(
        { error: 'Failed to create encryption key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Encryption key created successfully',
      alreadyExists: false,
    });
  } catch (error) {
    console.error('E2EE key generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate encryption key' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Remove E2EE key for this workspace (use with caution!)
 * Requires manage_e2ee permission
 * WARNING: This will make all encrypted data unreadable!
 */
export async function DELETE(_: Request, { params }: Params) {
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

  const { error: deleteError } = await adminClient
    .from('workspace_encryption_keys')
    .delete()
    .eq('ws_id', wsId);

  if (deleteError) {
    console.error('Failed to delete encryption key:', deleteError);
    return NextResponse.json(
      { error: 'Failed to delete encryption key' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'Encryption key deleted',
  });
}
