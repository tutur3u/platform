import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { WORKSPACE_HANDLE_REGEX } from '@tuturuuu/utils/workspace-handle';
import { InternalAccountAdminError } from './errors';

type AdminClient = SupabaseClient<Database>;

function sanitizedProfileCode(code: string | undefined) {
  const knownCodes = [
    '22023',
    '23503',
    '23505',
    '23514',
    '42501',
    '55P03',
    'PT429',
    'PGRST204',
    'PGRST205',
  ];
  return code && knownCodes.includes(code) ? code : 'unknown';
}

function logProfileFailure(
  stage: 'profile_read' | 'username_reserve' | 'profile_update',
  code: string | undefined
) {
  console.error('Internal account profile stage failed', {
    stage,
    code: sanitizedProfileCode(code),
  });
}

function logProfileCleanupFailure(
  stage: 'username_rollback' | 'previous_username_release',
  code: string | undefined
) {
  console.warn('Internal account profile cleanup failed', {
    stage,
    code: sanitizedProfileCode(code),
  });
}

export async function updateInternalAccountProfile({
  displayName,
  sbAdmin,
  targetUserId,
  username,
}: {
  displayName?: string;
  sbAdmin: AdminClient;
  targetUserId: string;
  username?: string | null;
}) {
  const normalizedDisplayName = displayName?.trim();
  const normalizedUsername = username?.trim().toLowerCase() || null;
  if (!normalizedDisplayName) {
    throw new InternalAccountAdminError('A display name is required', 400);
  }
  if (normalizedUsername && !WORKSPACE_HANDLE_REGEX.test(normalizedUsername)) {
    throw new InternalAccountAdminError('The username is invalid', 400);
  }

  const { data: currentProfile, error: profileError } = await sbAdmin
    .from('users')
    .select('handle')
    .eq('id', targetUserId)
    .maybeSingle();
  if (profileError || !currentProfile) {
    logProfileFailure('profile_read', profileError?.code);
    throw new InternalAccountAdminError(
      'Internal account profile not found',
      404
    );
  }

  const previousUsername = currentProfile.handle;
  const usernameChanged = previousUsername !== normalizedUsername;
  if (usernameChanged && normalizedUsername) {
    const { error: handleError } = await sbAdmin.from('handles').insert({
      creator_id: targetUserId,
      value: normalizedUsername,
    });
    if (handleError) {
      logProfileFailure('username_reserve', handleError.code);
      throw new InternalAccountAdminError(
        handleError.code === '23505'
          ? 'The username is already in use'
          : 'Unable to reserve the username',
        handleError.code === '23505' ? 409 : 500
      );
    }
  }

  const { error: updateError } = await sbAdmin
    .from('users')
    .update({
      display_name: normalizedDisplayName,
      handle: normalizedUsername,
    })
    .eq('id', targetUserId);
  if (updateError) {
    logProfileFailure('profile_update', updateError.code);
    if (usernameChanged && normalizedUsername) {
      try {
        const { error: rollbackError } = await sbAdmin
          .from('handles')
          .delete()
          .eq('value', normalizedUsername)
          .eq('creator_id', targetUserId);
        if (rollbackError) {
          logProfileCleanupFailure('username_rollback', rollbackError.code);
        }
      } catch {
        logProfileCleanupFailure('username_rollback', undefined);
      }
    }
    throw new InternalAccountAdminError(
      'Unable to update the internal account profile',
      500
    );
  }

  if (usernameChanged && previousUsername) {
    const { error: cleanupError } = await sbAdmin
      .from('handles')
      .delete()
      .eq('value', previousUsername)
      .eq('creator_id', targetUserId);
    if (cleanupError) {
      logProfileCleanupFailure('previous_username_release', cleanupError.code);
    }
  }

  return { displayName: normalizedDisplayName, username: normalizedUsername };
}
