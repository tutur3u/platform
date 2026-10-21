import 'server-only';
import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { updateManagedEmployeeProfile } from '@tuturuuu/utils/internal-accounts/employee-managed-profile';
import { InternalAccountAdminError } from './errors';

export async function updateManagedInternalAccountProfile(input: {
  actorUserId: string;
  targetUserId: string;
  email: string;
  displayName?: string;
  username?: string | null;
}) {
  if (!input.displayName?.trim())
    throw new InternalAccountAdminError('A display name is required', 400);
  try {
    return await updateManagedEmployeeProfile({
      ...checkEnvVariables({ useSecretKey: true }),
      ...input,
      displayName: input.displayName.trim(),
      username: input.username?.trim().toLowerCase() || null,
      // The request already authenticated this exact actor. Every SQL call
      // repeats the fresh root administrator assertion under the Auth pair lock.
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
