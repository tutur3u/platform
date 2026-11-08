/**
 * Workspace secret that turns the fee-lock feature on. Only a root admin can
 * set workspace secrets, so a workspace cannot enable it for itself. Absent or
 * any value other than `'true'` means off.
 */
export const FEE_LOCK_ENABLED_SECRET = 'ENABLE_FEE_LOCK';
