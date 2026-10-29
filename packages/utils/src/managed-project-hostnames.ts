import rule from './managed-project-hostnames-core.cjs';

/** True for any platform-owned or unsafe hostname a managed project must never serve. */
export const isReservedManagedProjectHostname =
  rule.isReservedManagedProjectHostname;
export const isSafeManagedProjectHostname = rule.isSafeManagedProjectHostname;
export const MAX_HOSTNAME_INPUT_LENGTH = rule.MAX_HOSTNAME_INPUT_LENGTH;
export const normalizeManagedProjectHostname =
  rule.normalizeManagedProjectHostname;
export const PLATFORM_HOSTNAME_ZONES = rule.PLATFORM_HOSTNAME_ZONES;
export const RESERVED_MANAGED_PROJECT_HOSTNAMES =
  rule.RESERVED_MANAGED_PROJECT_HOSTNAMES;
export const SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN =
  rule.SAFE_MANAGED_PROJECT_HOSTNAME_PATTERN;
