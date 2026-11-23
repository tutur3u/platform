/** Runtime switches for the API proxy guard, read on every request. */

function isEnvFlagEnabled(name: string, defaultOn = true): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') {
    return defaultOn;
  }

  return !/^(0|false|off|no)$/i.test(raw.trim());
}

/**
 * Whether trusted accounts/locations get scaled read limits (and verified
 * sessions get their own per-session bucket) at the edge. Default on; set
 * `API_PROXY_EDGE_TRUST_ENABLED=0` to disable trust uplift and fall back to
 * per-IP keying for cache-based identities without a deploy.
 */
export function edgeTrustEnabled(): boolean {
  return isEnvFlagEnabled('API_PROXY_EDGE_TRUST_ENABLED');
}

/**
 * Whether a browser session whose cookie credentials the assurance check
 * verified is limited as its user. Default on; `API_PROXY_SESSION_ACTOR_ENABLED=0`
 * returns such sessions to cache-based session or per-IP keying.
 */
export function verifiedSessionActorEnabled(): boolean {
  return isEnvFlagEnabled('API_PROXY_SESSION_ACTOR_ENABLED');
}
