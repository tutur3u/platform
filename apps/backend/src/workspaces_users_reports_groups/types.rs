use super::*;

#[derive(Clone, Debug, Default)]
pub(super) struct SupabaseAuthCookieGroup {
    pub(super) base: Option<String>,
    pub(super) chunks: BTreeMap<usize, String>,
    pub(super) duplicate: bool,
}

#[derive(Deserialize)]
pub(super) struct SupabaseCookieSession {
    pub(super) access_token: Option<String>,
}

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
pub(super) struct WorkspaceRow {
    pub(super) creator_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct WorkspaceUserLinkRow {
    pub(super) platform_user_id: Option<String>,
    pub(super) virtual_user_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct GroupMembershipRow {
    pub(super) group_id: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ReportGroupRow {
    pub(super) id: Option<String>,
    pub(super) name: Option<String>,
    pub(super) ws_id: Option<String>,
}

pub(super) struct EffectiveWorkspacePermissions {
    pub(super) has_all_permissions: bool,
    pub(super) permissions: Vec<String>,
}

impl EffectiveWorkspacePermissions {
    pub(super) fn contains(&self, permission: &str) -> bool {
        self.has_all_permissions || self.permissions.iter().any(|value| value == permission)
    }
}
