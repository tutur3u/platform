use super::*;

#[derive(Debug, Eq, PartialEq)]
pub(super) struct ListQuery {
    pub(super) contact_id: Option<String>,
    pub(super) page: i64,
    pub(super) page_size: i64,
    pub(super) q: String,
    pub(super) status: String,
}

impl ListQuery {
    pub(super) fn offset(&self) -> i64 {
        (self.page - 1) * self.page_size
    }
}

#[derive(Deserialize)]
pub(super) struct WorkspaceIdRow {
    pub(super) id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspacePersonalRow {
    pub(super) personal: Option<bool>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceCreatorRow {
    pub(super) creator_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct MembershipRow {
    #[serde(rename = "type")]
    pub(super) membership_type: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RoleMemberRow {
    #[serde(default)]
    pub(super) workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
pub(super) struct RoleRow {
    #[serde(default)]
    pub(super) workspace_role_permissions: Vec<PermissionRow>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceSecretRow {
    pub(super) value: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceGroupRow {
    pub(super) id: Option<String>,
    pub(super) name: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RecipientIdRow {
    pub(super) announcement_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct VerificationRow {
    pub(super) contact_id: Option<String>,
    pub(super) status: Option<String>,
    pub(super) expires_at: Option<String>,
}

/// Effective permissions a user has in a workspace, mirroring `getPermissions`.
/// A creator (or an `admin` permission) grants every check.
pub(super) struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    pub(super) fn all() -> Self {
        Self {
            all: true,
            permissions: Vec::new(),
        }
    }

    pub(super) fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions.iter().any(|permission| permission == "admin");
        Self { all, permissions }
    }

    pub(super) fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}
