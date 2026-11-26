import { isCloudflareIp } from './abuse-protection/abuse-subject';

/**
 * Cached trust keys for a proxied request: the session always, and for reads
 * the CIDR, IP and workspace. Trust granted to a shared Cloudflare address
 * never uplifts everyone, so those requests skip the location keys.
 */
export function trustLookupKeys(
  identity: {
    cidrKey: string | null;
    ipKey: string | null;
    sessionKey: string | null;
    workspaceKey: string | null;
  },
  ip: string,
  isRead: boolean
) {
  const location = isCloudflareIp(ip) ? [] : [identity.cidrKey, identity.ipKey];
  return [
    identity.sessionKey,
    ...(isRead ? [...location, identity.workspaceKey] : []),
  ].filter((key): key is string => key != null);
}
