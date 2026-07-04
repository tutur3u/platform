use super::*;

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct GitHubBotConfigRow {
    pub(super) app_id: Option<String>,
    pub(super) enabled: Option<bool>,
    pub(super) installation_id: Option<String>,
    pub(super) last_validated_at: Option<String>,
    pub(super) last_validation_error: Option<String>,
    pub(super) private_key_encrypted: Option<String>,
    pub(super) private_key_fingerprint: Option<String>,
    pub(super) repository_name: Option<String>,
    pub(super) repository_owner: Option<String>,
    pub(super) updated_at: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct GitHubBotWatcherClientRow {
    pub(super) created_at: Option<String>,
    pub(super) expires_at: Option<String>,
    pub(super) id: Option<String>,
    pub(super) last_four: Option<String>,
    pub(super) last_issued_at: Option<String>,
    pub(super) last_used_at: Option<String>,
    pub(super) name: Option<String>,
    pub(super) revoked_at: Option<String>,
    pub(super) token_prefix: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct GitHubBotAuditEventRow {
    pub(super) actor_type: Option<String>,
    pub(super) created_at: Option<String>,
    pub(super) event_type: Option<String>,
    pub(super) id: Option<String>,
    #[serde(default)]
    pub(super) metadata: Value,
}

#[derive(Deserialize)]
pub(super) struct MembershipRow {
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
pub(super) struct RoleMemberRow {
    #[serde(default)]
    pub(super) workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
pub(super) struct RoleRow {
    #[serde(default)]
    pub(super) workspace_role_permissions: Vec<PermissionRow>,
}
