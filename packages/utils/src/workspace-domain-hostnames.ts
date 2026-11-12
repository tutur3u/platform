import {
  isReservedManagedProjectHostname,
  normalizeManagedProjectHostname,
  SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN,
} from './managed-project-hostnames';

// Dependency-free apart from the managed-project rule so the edge Worker
// (apps/workspace-domains) and apps/web share one hostname policy.

/**
 * Platform zones whose existing hosts stay reserved whatever apex is
 * configured. The active platform-subdomain apex and the SaaS fallback origin
 * are deployment configuration (WORKSPACE_DOMAINS_PLATFORM_APEX,
 * WORKSPACE_DOMAINS_FALLBACK_ORIGIN), never constants.
 */
export const KNOWN_PLATFORM_APEXES = Object.freeze(['ttr.gg']);

/** Zones a workspace domain may never use, on top of the managed-project rule. */
export const RESERVED_WORKSPACE_DOMAIN_ZONES = Object.freeze([
  'tuturuu.com',
  'tuturuuu.vn',
  'tuturuuu.dev',
]);

/**
 * `<label>.<apex>` names that belong to the platform, under every known and
 * configured apex. Fails closed for short
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
  // Bootstrap host of the first workspace domain (vhp.ttr.gg); bound by
  // migration seed.
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

export interface WorkspaceDomainHostnamePolicy {
  /** Configured platform-subdomain apex; null disables platform subdomains. */
  platformApex?: string | null;
}

/** Normalized configured apex, or null when unset or not a safe DNS name. */
export function normalizePlatformApex(value: string | null | undefined) {
  const apex = normalizeManagedProjectHostname(value ?? '');
  return apex && SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN.test(apex) ? apex : null;
}

/**
 * Classifies a hostname a workspace wants to bind. Platform names
 * (tuturuuu.com, tutur3u.com, released domains, every known or configured
 * platform apex, reserved labels and nested names under it) are rejected.
 * One-label `<label>.<apex>` names under the configured apex are platform
 * subdomains; with no apex configured every name under a platform zone is
 * reserved (fail closed). Everything else safe is a custom hostname.
 */
export function classifyWorkspaceDomainHostname(
  value: unknown,
  policy: WorkspaceDomainHostnamePolicy = {}
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
  const apex = normalizePlatformApex(policy.platformApex);
  const zones = [
    ...new Set([...KNOWN_PLATFORM_APEXES, ...(apex ? [apex] : [])]),
  ];
  const zone = zones.find((candidate) => isWithinZone(hostname, candidate));
  if (zone) {
    const label =
      hostname === zone ? '' : hostname.slice(0, -(zone.length + 1));
    if (
      zone !== apex ||
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
