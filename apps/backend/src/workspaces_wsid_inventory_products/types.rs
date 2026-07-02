use super::*;

// ---------------------------------------------------------------------------
// Types for deserialization
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub(super) struct PermissionRow {
    pub(super) permission: Option<String>,
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
pub(super) struct AvatarRow {
    pub(super) id: Option<String>,
    pub(super) avatar_url: Option<Value>,
}

#[derive(Deserialize)]
pub(super) struct RpcProductRow {
    #[serde(default)]
    pub(super) total_count: Option<i64>,
    #[serde(default)]
    pub(super) product: Option<Value>,
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub(super) struct InventoryUser {
    pub(super) access_token: Option<String>,
    pub(super) id: String,
}

pub(super) enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum MembershipCheck {
    Member,
    NotMember,
}

pub(super) struct EffectivePermissions {
    pub(super) has_all_permissions: bool,
    pub(super) permissions: Vec<String>,
}

// ---------------------------------------------------------------------------
// Query parameter struct
// ---------------------------------------------------------------------------

pub(super) struct ProductsQuery {
    pub(super) q: String,
    pub(super) page: i64,
    pub(super) page_size: i64,
    pub(super) category_id: Option<String>,
    pub(super) manufacturer_id: Option<String>,
    pub(super) sort_by: String,
    pub(super) sort_order: String,
    pub(super) status: String,
}
