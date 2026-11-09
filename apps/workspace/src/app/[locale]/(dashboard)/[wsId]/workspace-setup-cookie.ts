/**
 * Short-lived cookie that records a workspace setup attempt. The dashboard
 * layout reads it to avoid trapping the user on the "Preparing Workspace"
 * screen when Polar provisioning is degraded (the workspace still has no
 * resolved tier). Kept per-workspace so attempts don't leak across workspaces.
 */
export function getWorkspaceSetupAttemptCookie(wsId: string) {
  return `ws-setup-attempted-${wsId}`;
}

/** Lifetime of the attempt cookie. Short so a genuine retry can happen later. */
export const WORKSPACE_SETUP_ATTEMPT_COOKIE_MAX_AGE = 60;
