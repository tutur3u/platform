import type { Session } from '@supabase/supabase-js';
import { decodeJwt } from 'jose';
import { z } from 'zod';

const tenantGuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeTenant(value: unknown) {
  return typeof value === 'string' && tenantGuid.test(value)
    ? value.toLowerCase()
    : null;
}

/** Only use with the session returned by the server's successful code exchange. */
export function isAzureSessionTenantAllowed(
  session: Session | null | undefined,
  allowedTenant: string | undefined
): boolean {
  if (!session) return true;
  const claims = decodeJwt(session.access_token);
  const parsedMethods = z
    .array(z.object({ method: z.string(), provider: z.string().optional() }))
    .safeParse(claims.amr ?? []);
  if (!parsedMethods.success) return false;
  const methods = parsedMethods.data;
  const identities =
    session.user.identities?.filter(
      (identity) => identity.provider === 'azure'
    ) ?? [];
  const provider = session.user.app_metadata.provider;
  // An old Azure identity must not block email recovery or another provider.
  if (
    methods.length > 0 &&
    !methods.some((entry) => entry.method === 'oauth')
  ) {
    return true;
  }
  const latestIdentity = session.user.identities?.toSorted((a, b) =>
    (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? '')
  )[0];
  const azureOAuth =
    methods.some((entry) => entry.provider === 'azure') ||
    (latestIdentity?.last_sign_in_at
      ? latestIdentity.provider === 'azure'
      : provider === 'azure') ||
    (methods.some((entry) => entry.method === 'oauth') &&
      identities.length > 0 &&
      !latestIdentity?.last_sign_in_at);
  if (!azureOAuth) return true;
  const expected = normalizeTenant(allowedTenant);
  if (!expected) return false;
  if (identities.length === 0) return false;
  return identities.every((identity) => {
    const data = identity.identity_data;
    const tid = data?.tid ?? data?.custom_claims?.tid;
    const issuer = data?.iss ?? data?.custom_claims?.iss;
    const issuerTenant =
      typeof issuer === 'string'
        ? /^https:\/\/login\.microsoftonline\.com\/([0-9a-f-]{36})\/v2\.0\/?$/i.exec(
            issuer
          )?.[1]
        : undefined;
    if (tid === undefined && issuerTenant === undefined) return false;
    if (tid !== undefined && normalizeTenant(tid) !== expected) return false;
    if (issuer !== undefined && normalizeTenant(issuerTenant) !== expected)
      return false;
    return true;
  });
}
