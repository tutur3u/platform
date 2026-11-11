import {
  isReservedManagedProjectHostname,
  normalizeManagedProjectHostname,
  SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN,
} from './managed-project-hostnames';

// Dependency-free apart from the managed-project rule so the edge Worker
// (apps/workspace-domains) and apps/web share one hostname policy.

/** Zone that hosts `<label>.ttr.gg` platform subdomains. */
export const WORKSPACE_DOMAIN_PLATFORM_ZONE = 'ttr.gg';

/** CNAME/ALIAS target customers point custom hostnames at (Cloudflare for SaaS fallback origin). */
export const WORKSPACE_DOMAIN_CNAME_TARGET = 'saas.ttr.gg';

/** Zones a workspace domain may never use, on top of the managed-project rule. */
export const RESERVED_WORKSPACE_DOMAIN_ZONES = Object.freeze([
  'tuturuu.com',
  'tuturuuu.vn',
  'tuturuuu.dev',
]);

/**
 * `<label>.ttr.gg` names that belong to the platform. Fails closed for short
 * labels and generic infrastructure words a customer could use to impersonate
 * Tuturuuu.
 */
export const RESERVED_PLATFORM_SUBDOMAIN_LABELS = Object.freeze([
  'admin',
  'api',
  'app',
  'apps',
  'assets',
  'auth',
  'billing',
  'cdn',
  'dashboard',
  'docs',
  'edge',
  'fysh',
  'help',
  'id',
  'login',
  'mail',
  'origin',
  'pay',
  'saas',
  'security',
  'sso',
  'static',
  'status',
  'support',
  'ttr',
  'tuturuuu',
  'tutur3u',
  // Bootstrap host of the first workspace domain; bound by migration seed.
  'vhp',
  'www',
]);

/** Platform subdomain labels: 3-40 characters, lowercase letters, digits and inner hyphens. */
export const PLATFORM_SUBDOMAIN_LABEL_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/u;

export type WorkspaceDomainKind = 'custom' | 'platform_subdomain';

export type WorkspaceDomainHostnameResult =
  | { ok: true; hostname: string; kind: WorkspaceDomainKind }
  | { ok: false; hostname: string; reason: 'invalid' | 'reserved' };

/** Lowercase, trim, strip scheme/path/trailing dots. Returns '' for empty input. */
export function normalizeWorkspaceDomainHostname(value: unknown): string {
  return normalizeManagedProjectHostname(value);
}

/**
 * Normalizes a hostname from an HTTP `Host` header: drops a port, rejects IPv6
 * literals and anything that is not a safe DNS name. Returns null when unusable.
 */
export function normalizeRequestHost(
  value: string | null | undefined
): string | null {
  if (!value || value.length > 300) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) return null;
  const withoutPort = trimmed.replace(/:\d{1,5}$/u, '');
  const hostname = normalizeManagedProjectHostname(withoutPort);
  return SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(hostname) ? hostname : null;
}

function isWithinZone(hostname: string, zone: string) {
  return hostname === zone || hostname.endsWith(`.${zone}`);
}

/**
 * Classifies a hostname a workspace wants to bind. Platform names
 * (tuturuuu.com, tutur3u.com, the ttr.gg apex, reserved ttr.gg labels and
 * nested ttr.gg names) are rejected; one-label `<label>.ttr.gg` names are
 * platform subdomains; everything else safe is a custom hostname.
 */
export function classifyWorkspaceDomainHostname(
  value: unknown
): WorkspaceDomainHostnameResult {
  const hostname = normalizeWorkspaceDomainHostname(value);
  if (!SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(hostname)) {
    return { ok: false, hostname, reason: 'invalid' };
  }
  if (
    isReservedManagedProjectHostname(hostname) ||
    RESERVED_WORKSPACE_DOMAIN_ZONES.some((zone) => isWithinZone(hostname, zone))
  ) {
    return { ok: false, hostname, reason: 'reserved' };
  }
  if (isWithinZone(hostname, WORKSPACE_DOMAIN_PLATFORM_ZONE)) {
    const label = hostname.slice(
      0,
      -(WORKSPACE_DOMAIN_PLATFORM_ZONE.length + 1)
    );
    if (
      !label ||
      label.includes('.') ||
      !PLATFORM_SUBDOMAIN_LABEL_PATTERN.test(label) ||
      label.includes('--') ||
      RESERVED_PLATFORM_SUBDOMAIN_LABELS.includes(label)
    ) {
      return { ok: false, hostname, reason: 'reserved' };
    }
    return { ok: true, hostname, kind: 'platform_subdomain' };
  }
  return { ok: true, hostname, kind: 'custom' };
}

/** True when the hostname is the registrable apex (two labels, e.g. example.com). */
export function isApexHostname(hostname: string): boolean {
  return hostname.split('.').length === 2;
}
