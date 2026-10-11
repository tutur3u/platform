use serde::Deserialize;

#[derive(Deserialize)]
pub(super) struct WorkspaceIdRow {
    pub(super) id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    pub(super) membership_type: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceCreatorRow {
    pub(super) creator_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct DefaultPermissionRow {
    pub(super) permission: Option<String>,
}

/// Mirrors the embedded role-membership permission rows:
/// `workspace_roles!inner(workspace_role_permissions(permission))`.
#[derive(Deserialize)]
pub(super) struct RoleMemberRow {
    pub(super) workspace_roles: Option<RoleRow>,
}

#[derive(Deserialize)]
pub(super) struct RoleRow {
    pub(super) workspace_role_permissions: Option<Vec<PermissionRow>>,
}

/// Outcome of resolving the caller's effective workspace permissions, mirroring
/// the legacy `getPermissions(...)` helper. `None` from the resolver maps to the
/// legacy `null` return (HTTP 404).
pub(super) struct PermissionsContext {
    pub(super) is_creator: bool,
    pub(super) is_admin: bool,
    pub(super) permissions: Vec<String>,
}

impl PermissionsContext {
    /// Mirrors `withoutPermission(permission)` from the legacy permissions result.
    pub(super) fn without_permission(&self, permission: &str) -> bool {
        !(self.is_creator
            || self.is_admin
            || self.permissions.iter().any(|value| value == permission))
    }
}
