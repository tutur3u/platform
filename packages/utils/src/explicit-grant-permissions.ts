import type { PermissionId } from '@tuturuuu/types';

// Only the audited root-workspace singleton role can grant these permissions.
export const EXPLICIT_GRANT_PERMISSIONS = [
  'manage_mastermind',
] as const satisfies readonly PermissionId[];
