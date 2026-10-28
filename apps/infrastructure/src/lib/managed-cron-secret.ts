import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';

export function canMutateInfrastructureSecret(
  email: string | undefined,
  ...names: (string | undefined | null)[]
) {
  return (
    !names.some(
      (name) => name?.trim().toUpperCase() === 'MANAGED_CRON_ENABLED'
    ) || isExactTuturuuuDotComEmail(email)
  );
}
