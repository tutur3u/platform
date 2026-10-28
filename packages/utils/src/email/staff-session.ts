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

// Case-sensitive like isValidTuturuuuEmail: Auth stores normalized addresses.
const EXACT_STAFF_EMAIL = /^[^\s@]+@tuturuuu\.com$/;

function issuerDirectory(issuer: unknown): string | null {
  if (typeof issuer !== 'string') return null;
  const match = issuer.match(
    /^https:\/\/(?:login\.microsoftonline\.com\/([^/]+)\/v2\.0|sts\.windows\.net\/([^/]+)\/)$/
  );
  return match?.[1] ?? match?.[2] ?? null;
}

export type StaffSessionDomainPolicy = {
  /** Also accept @xwf.tuturuuu.com. Only for gates that already accepted it. */
  allowXwf?: boolean;
};

/**
 * Only pass a current, subject-bound Auth user, never a profile or JWT projection.
 * Defaults to the exact @tuturuuu.com domain.
 */
export function isVerifiedTuturuuuStaffSession(
  user: StaffSessionUser | null | undefined,
  { allowXwf = false }: StaffSessionDomainPolicy = {}
): boolean {
  if (
    !user?.email_confirmed_at ||
    !(allowXwf
      ? isValidTuturuuuEmail(user.email)
      : typeof user.email === 'string' && EXACT_STAFF_EMAIL.test(user.email)) ||
    !Array.isArray(user.identities) ||
    user.identities.length === 0
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
