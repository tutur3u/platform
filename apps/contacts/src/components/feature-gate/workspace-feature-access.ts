/**
 * Shared access resolution for Contacts modules that used to answer every
 * non-happy path with `notFound()`.
 *
 * A 404 hides the three cases an operator can act on — the module is switched
 * off for this workspace, they lack the permission, or their workspace profile
 * is unresolved — and it also hid a plain bug: several pages 404'd personal
 * workspaces even though the sidebar links them and the underlying APIs
 * normalize `personal` into a real workspace id.
 */
export type WorkspaceFeatureAccessState =
  | { canManage: boolean; status: 'ready' }
  | { canEnable: boolean; status: 'disabled' }
  | { status: 'forbidden' }
  | { status: 'unavailable' };

export interface WorkspaceFeatureAccessInput {
  /** True when the caller may flip the module's toggle. */
  canEnableFeature: boolean;
  /** True when the caller may act inside the module, not only read it. */
  canManageFeature: boolean;
  /** True when the caller may read the module at all. */
  canView: boolean;
  /** Resolved toggle decision, normally from `isWorkspaceFeatureEnabled`. */
  enabled: boolean;
  /** False when the workspace or the caller's workspace profile is unresolved. */
  hasWorkspaceAccess: boolean;
}

/**
 * Personal workspaces start opted out of the CRM modules, but can opt in from
 * the page itself. Shared workspaces keep whatever each module defaulted to
 * before this gate existed, so nothing changes for an existing workspace.
 */
export function isWorkspaceFeatureEnabled({
  defaultEnabled,
  isPersonal,
  value,
}: {
  defaultEnabled: boolean;
  isPersonal: boolean;
  value: string | null | undefined;
}) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return isPersonal ? false : defaultEnabled;
}

export function resolveWorkspaceFeatureAccess({
  canEnableFeature,
  canManageFeature,
  canView,
  enabled,
  hasWorkspaceAccess,
}: WorkspaceFeatureAccessInput): WorkspaceFeatureAccessState {
  if (!hasWorkspaceAccess) {
    return { status: 'unavailable' };
  }

  if (!canView) {
    return { status: 'forbidden' };
  }

  if (!enabled) {
    return { canEnable: canEnableFeature, status: 'disabled' };
  }

  return { canManage: canManageFeature, status: 'ready' };
}
