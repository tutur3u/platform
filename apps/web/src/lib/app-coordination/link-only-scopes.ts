import { UPSKII_LINK_WRITE_SCOPE } from '@/lib/integrations/upskii/constants';

/**
 * Scopes that authorise a single account-link write. An exchange that issues
 * one returns a bearer carrying only link scopes, alive for at most
 * {@link LINK_ONLY_BEARER_TTL_SECONDS}, and no refresh token, so a leaked
 * bearer cannot outlive the link ceremony.
 */
export const LINK_ONLY_SCOPES: readonly string[] = [UPSKII_LINK_WRITE_SCOPE];

export const LINK_ONLY_BEARER_TTL_SECONDS = 120;

export function isLinkOnlyScope(scope: string) {
  return LINK_ONLY_SCOPES.includes(scope);
}

export function hasLinkOnlyScope(scopes: readonly string[]) {
  return scopes.some(isLinkOnlyScope);
}
