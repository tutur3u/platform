import type { User } from '@supabase/supabase-js';
import { isValidTuturuuuEmail } from './client';

type StaffSessionUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
  identities?: readonly Pick<
    NonNullable<User['identities']>[number],
    'provider' | 'identity_data'
  >[];
};

function issuerDirectory(issuer: unknown): string | null {
  if (typeof issuer !== 'string') return null;
  const match = issuer.match(
    /^https:\/\/(?:login\.microsoftonline\.com\/([^/]+)\/v2\.0|sts\.windows\.net\/([^/]+)\/)$/
  );
  return match?.[1] ?? match?.[2] ?? null;
}

/** Only pass a current, subject-bound Auth user, never a profile or JWT projection. */
export function isVerifiedTuturuuuStaffSession(
  user: StaffSessionUser | null | undefined
): boolean {
  if (
    !user?.email_confirmed_at ||
    !isValidTuturuuuEmail(user.email) ||
    !Array.isArray(user.identities)
  )
    return false;
  const azureIdentities = user.identities.filter(
    (identity) => identity.provider === 'azure'
  );
  if (azureIdentities.length === 0) return true;
  const expected = process.env.TUTURUUU_AZURE_TENANT_ID;
  if (!expected) return false;
  return azureIdentities.every((identity) => {
    const data = identity.identity_data;
    const directory = data?.tid ?? issuerDirectory(data?.iss);
    return (
      typeof directory === 'string' &&
      directory === expected &&
      (data?.iss === undefined || issuerDirectory(data.iss) === expected)
    );
  });
}
