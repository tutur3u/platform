/** Subject keys the proxy guard derives from a request's address and path. */

/**
 * Mirrors `reputation.ts getCidrSubjectKey` so the edge cidr subject key matches
 * the DB-side trusted-location key.
 */
export function getCidrSubjectKeyEdge(ipAddress: string | null): string | null {
  if (!ipAddress) {
    return null;
  }

  const ipv4Parts = ipAddress.split('.');
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every((part) => /^\d{1,3}$/.test(part))
  ) {
    return `cidr:${ipv4Parts.slice(0, 3).join('.')}.0/24`;
  }

  const ipv6Parts = ipAddress.split(':').filter(Boolean);
  if (ipv6Parts.length >= 4) {
    return `cidr:${ipv6Parts.slice(0, 4).join(':')}::/64`;
  }

  return null;
}

const WORKSPACE_PATH_PATTERN =
  /^\/api(?:\/v1)?\/workspaces\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:\/|$)/u;

export function getWorkspaceSubjectKey(pathname: string): string | null {
  const match = WORKSPACE_PATH_PATTERN.exec(pathname);
  return match ? `workspace:${match[1]!.toLowerCase()}` : null;
}
