/**
 * THE staff-only workspace secrets (MANAGED_CRON_ENABLED, ENABLE_BOARD_CYCLES,
 * ENABLE_FEE_LOCK): apps/web and apps/infrastructure require a verified staff
 * session, and public.guard_workspace_reserved_secrets() rejects them from API
 * roles. A test keeps that trigger's array equal to this list.
 */
export const STAFF_ONLY_WORKSPACE_SECRETS = [
  'MANAGED_CRON_ENABLED',
  'ENABLE_BOARD_CYCLES',
  'ENABLE_FEE_LOCK',
] as const;

export function isStaffOnlyWorkspaceSecretName(name?: string | null) {
  const normalized = name?.trim().toUpperCase();
  return (
    !!normalized &&
    (STAFF_ONLY_WORKSPACE_SECRETS as readonly string[]).includes(normalized)
  );
}
