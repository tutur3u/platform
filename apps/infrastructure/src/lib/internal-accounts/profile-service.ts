import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { isValidAdminProfileHandle } from '@tuturuuu/utils/internal-accounts/employee-profile-handle';
import { updateUnmanagedEmployeeProfile } from '@tuturuuu/utils/internal-accounts/employee-unmanaged-profile';
import { InternalAccountAdminError } from './errors';

export async function updateInternalAccountProfile(input: {
  actorUserId: string;
  email: string;
  displayName?: string;
  sbAdmin: SupabaseClient<Database>;
  targetUserId: string;
  username?: string | null;
}) {
  const displayName = input.displayName?.trim();
  const username = input.username?.trim().toLowerCase() || null;
  if (!displayName)
    throw new InternalAccountAdminError('A display name is required', 400);
  try {
    const { data: current, error } = await input.sbAdmin
      .from('users')
      .select('display_name, handle')
      .eq('id', input.targetUserId)
      .maybeSingle();
    if (error || !current) {
      const code = error?.code;
      console.error('Internal account profile stage failed', {
        stage: 'profile_read',
        code:
          code && ['42501', 'PGRST204', 'PGRST205'].includes(code)
            ? code
            : 'unknown',
      });
      throw new InternalAccountAdminError(
        'Internal account profile not found',
        404
      );
    }
    if (
      !isValidAdminProfileHandle({
        username,
        currentUsername: current.handle,
      })
    )
      throw new InternalAccountAdminError('The username is invalid', 400);
    return await updateUnmanagedEmployeeProfile({
      ...checkEnvVariables({ useSecretKey: true }),
      actorUserId: input.actorUserId,
      targetUserId: input.targetUserId,
      email: input.email,
      expectedDisplayName: current.display_name,
      expectedUsername: current.handle,
      displayName,
      username,
      // Route authentication binds the actor; SQL repeats the fresh root check.
      authorize: async (actor) => actor === input.actorUserId,
    });
  } catch (error) {
    if (error instanceof InternalAccountAdminError) throw error;
    throw new InternalAccountAdminError(
      'Unable to verify the profile update',
      503
    );
  }
}
