import rule from './managed-project-hostnames-core.cjs';

/** True for any platform-owned hostname a managed project must never serve. */
export const isReservedManagedProjectHostname =
  rule.isReservedManagedProjectHostname;
export const normalizeManagedProjectHostname =
  rule.normalizeManagedProjectHostname;
export const PLATFORM_HOSTNAME_ZONES = rule.PLATFORM_HOSTNAME_ZONES;
export const RESERVED_MANAGED_PROJECT_HOSTNAMES =
  rule.RESERVED_MANAGED_PROJECT_HOSTNAMES;
