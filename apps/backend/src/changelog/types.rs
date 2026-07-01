use super::*;

#[derive(Deserialize)]
pub(super) struct PostgrestError {
    pub(super) code: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct ChangelogListQuery {
    pub(super) category: Option<String>,
    pub(super) page: Option<i64>,
    pub(super) page_size: Option<i64>,
    pub(super) published: Option<bool>,
}

pub(super) struct ChangelogWriteAccess {
    pub(super) access_token: String,
    pub(super) user_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ChangelogAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

#[derive(Serialize)]
pub(super) struct HasWorkspacePermissionRequest<'a> {
    pub(super) p_permission: &'a str,
    pub(super) p_user_id: &'a str,
    pub(super) p_ws_id: &'a str,
}

pub(super) enum ChangelogRoute<'a> {
    Detail { id: &'a str },
    List,
    Publish { id: &'a str },
    Slug { slug: &'a str },
}

pub(super) struct ChangelogAuthenticatedRequest<'a> {
    pub(super) method: OutboundMethod,
    pub(super) url: &'a str,
    pub(super) accept: &'a str,
    pub(super) access_token: &'a str,
    pub(super) prefer: Option<&'a str>,
    pub(super) body: Option<&'a str>,
}
