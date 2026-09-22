import 'server-only';

import { randomUUID } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { coordinate, coordinationKey } from '@tuturuuu/utils/coordination';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { InternalAccountAdminError } from './errors';

const unavailable = () =>
  new InternalAccountAdminError(
    'Unable to reset authenticators. Try again.',
    503
  );

/** Administrative reset shares the same lease as native device registration.
 * Clear device proofs before deleting factors, so a partially failed reset
 * cannot continue accepting an old device proof. Retrying is safe.
 */
export async function resetInternalAccountAuthenticators({
  actorUserId,
  confirmationEmail,
  sbAdmin,
  targetUserId,
}: {
  actorUserId: string;
  confirmationEmail: string;
  sbAdmin: TypedSupabaseClient;
  targetUserId: string;
}) {
  if (actorUserId === targetUserId) {
    throw new InternalAccountAdminError(
      'You cannot reset your own authenticators here',
      409
    );
  }
  const lease = {
    namespace: 'authenticator' as const,
    key: coordinationKey(targetUserId),
    owner: randomUUID(),
  };
  const acquired = await coordinate({ ...lease, action: 'acquire' }).catch(
    () => {
      throw unavailable();
    }
  );
  if (acquired.outcome !== 'acquired') {
    throw new InternalAccountAdminError(
      'Another authenticator change is in progress. Try again.',
      409
    );
  }
  const startedAt = Date.now();
  const assertOwned = async () => {
    if (
      Date.now() - startedAt >= 60_000 ||
      (await coordinate({ ...lease, action: 'check' })).outcome !== 'owned'
    ) {
      throw unavailable();
    }
  };
  try {
    const { data, error } = await sbAdmin.auth.admin.getUserById(targetUserId);
    if (error) throw unavailable();
    const user = data.user;
    if (
      !user ||
      user.id !== targetUserId ||
      !isExactTuturuuuDotComEmail(user.email)
    ) {
      throw new InternalAccountAdminError('Internal account not found', 404);
    }
    if (
      user.email?.trim().toLowerCase() !==
      confirmationEmail.trim().toLowerCase()
    ) {
      throw new InternalAccountAdminError(
        'Confirmation email does not match the target account',
        400
      );
    }
    const factors = await sbAdmin.auth.admin.mfa.listFactors({
      userId: targetUserId,
    });
    if (factors.error || !factors.data) throw unavailable();
    await assertOwned();
    const cleared = await sbAdmin.auth.admin.updateUserById(targetUserId, {
      app_metadata: {
        tuturuuu_device_authenticators: {
          version: 1,
          locked: false,
          devices: [],
        },
      },
    });
    if (cleared.error) throw unavailable();
    for (const factor of factors.data.factors) {
      await assertOwned();
      const deleted = await sbAdmin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: targetUserId,
      });
      if (deleted.error) throw unavailable();
    }
    await assertOwned();
    const remaining = await sbAdmin.auth.admin.mfa.listFactors({
      userId: targetUserId,
    });
    if (remaining.error || !remaining.data || remaining.data.factors.length) {
      throw unavailable();
    }
    console.info('Internal account authenticators reset', {
      actorUserId,
      targetUserId,
      factorCount: factors.data.factors.length,
    });
  } catch (error) {
    if (error instanceof InternalAccountAdminError) throw error;
    throw unavailable();
  } finally {
    await coordinate({ ...lease, action: 'release' }).catch(() => {
      console.warn('Could not release account authenticator reset lease');
    });
  }
}
