//! Handler for `GET /api/v1/workspaces/:wsId/user-profile-links`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/user-profile-links/route.ts`
//! (GET only; POST is left to the still-live Next.js route — this handler
//! returns `None` for every non-GET method so Next.js continues to serve it).
//!
//! ## Legacy GET behavior
//!
//! 1. `getPermissions({ wsId, request })` resolves the caller's effective
//!    workspace permissions (with `internal`/`personal`/handle workspace-id
//!    normalization). A `null` result ->
//!    `404 { "error": "Not found" }`.
//! 2. Checks `manage_user_profile_links`; missing ->
//!    `403 { "message": "Insufficient permissions to manage profile links" }`.
//! 3. Checks `view_users_private_info` to decide whether private fields
//!    (email, phone, birthday, gender) are included on the `target_user`
//!    object; callers that lack this permission receive `null` for those
//!    fields and `"private_fields_hidden": true`.
//! 4. Reads `workspace_user_profile_links_with_stats` with the admin
//!    (service-role) client, ordered by `created_at` descending.
//! 5. Collects unique non-empty `target_user_id` values and fetches matching
//!    `workspace_users` rows (also with the admin client).
//! 6. Returns `200 { "links": [...] }` (no-store).
//!
//! ## Behavior gaps
//!
//! - `normalizeAvatarImageSrc` (from `@tuturuuu/utils/avatar-url`) is NOT
//!   reproduced; `avatar_url` is forwarded verbatim from the DB row. The
//!   transformation is cosmetic (blob-URL stripping / CDN rewriting) and
//!   does not affect correctness for most callers.
//! - The legacy route calls `getPermissions` once and inspects its result for
//!   both permissions. This handler calls `authorize_workspace_permission`
//!   twice (one round-trip each). The observable result is identical.
//! - An unauthenticated caller causes `authorize_workspace_permission` to
//!   return `Unauthorized`; the legacy `getPermissions` returns `null` for
//!   the same case. Both result in a 404 response here, matching the legacy
//!   `if (!permissions) return 404` guard.

use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

// Path shape: /api/v1/workspaces/{wsId}/user-profile-links
const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/user-profile-links";

const MANAGE_PROFILE_LINKS_PERMISSION: &str = "manage_user_profile_links";
const VIEW_PRIVATE_INFO_PERMISSION: &str = "view_users_private_info";

const NOT_FOUND_MESSAGE: &str = "Not found";
const INSUFFICIENT_PERMISSIONS_MESSAGE: &str = "Insufficient permissions to manage profile links";
const ERROR_LISTING_LINKS_MESSAGE: &str = "Error listing profile links";

#[derive(Deserialize)]
struct WorkspaceUserRow {
    id: Option<String>,
    display_name: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    birthday: Option<String>,
    gender: Option<String>,
    archived: Option<bool>,
}

pub(crate) async fn handle_workspaces_wsid_user_profile_links_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = profile_links_ws_id(request.path)?;

    Some(match request.method {
        "GET" => profile_links_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn profile_links_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Auth step 1: authenticate + check manage_user_profile_links.
    // Both Unauthorized and NotFound map to 404, matching the legacy
    // `if (!permissions) return 404` guard — getPermissions returns null for
    // both an unauthenticated caller and a missing/inaccessible workspace.
    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        MANAGE_PROFILE_LINKS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return no_store_response(json_response(404, json!({ "error": NOT_FOUND_MESSAGE })));
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return no_store_response(json_response(
                403,
                json!({ "message": INSUFFICIENT_PERMISSIONS_MESSAGE }),
            ));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return no_store_response(json_response(
                500,
                json!({ "message": ERROR_LISTING_LINKS_MESSAGE }),
            ));
        }
    };

    let ws_id = &authorization.ws_id;

    // Auth step 2: check view_users_private_info.
    // BackendRequest is Copy, so we can re-use it for the second RPC call.
    // Any non-Ok result means the caller lacks the permission (private fields
    // are hidden). Errors in the second check do not abort the request.
    let can_view_private_info = authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PRIVATE_INFO_PERMISSION,
        outbound,
    )
    .await
    .is_ok();

    // Fetch all profile links for this workspace.
    let links_rows = match fetch_profile_links(contact_data, outbound, ws_id).await {
        Ok(rows) => rows,
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "message": ERROR_LISTING_LINKS_MESSAGE }),
            ));
        }
    };

    // Collect unique non-empty target_user_ids.
    let target_user_ids: Vec<String> = {
        let mut seen = HashSet::new();
        links_rows
            .iter()
            .filter_map(|link| {
                link.get("target_user_id")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                    .map(str::to_owned)
            })
            .filter(|id| seen.insert(id.clone()))
            .collect()
    };

    // Fetch target users when any per_user links are present.
    let users_by_id: HashMap<String, WorkspaceUserRow> = if target_user_ids.is_empty() {
        HashMap::new()
    } else {
        match fetch_target_users(contact_data, outbound, ws_id, &target_user_ids).await {
            Ok(users) => users
                .into_iter()
                .filter_map(|user| user.id.clone().map(|id| (id, user)))
                .collect(),
            Err(()) => {
                return no_store_response(json_response(
                    500,
                    json!({ "message": ERROR_LISTING_LINKS_MESSAGE }),
                ));
            }
        }
    };

    // Build the final links array, applying defaults and attaching target_user.
    let links: Vec<Value> = links_rows
        .into_iter()
        .map(|mut link| {
            // Apply JS `?? true` defaults for nullable booleans.
            apply_bool_default(&mut link, "prefill_existing_values", true);
            apply_bool_default(&mut link, "requires_auth", true);

            let target_user = link
                .get("target_user_id")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .and_then(|id| users_by_id.get(id))
                .map(|user| build_target_user(user, can_view_private_info));

            if let Some(obj) = link.as_object_mut() {
                obj.insert("target_user".to_owned(), target_user.unwrap_or(Value::Null));
            }

            link
        })
        .collect();

    no_store_response(json_response(200, json!({ "links": links })))
}

/// Reads all rows from `workspace_user_profile_links_with_stats` for the
/// given workspace, ordered by `created_at` descending, using the service-role
/// client (matching the legacy `createAdminClient()` read, RLS bypassed).
async fn fetch_profile_links(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_profile_links_with_stats",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.desc".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Fetches `workspace_users` rows for the given IDs scoped to the workspace,
/// using the service-role client (matching the legacy `createAdminClient()` read).
async fn fetch_target_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> Result<Vec<WorkspaceUserRow>, ()> {
    let in_list = format!("in.({})", user_ids.join(","));
    let url = contact_data
        .rest_url(
            "workspace_users",
            &[
                (
                    "select",
                    "id,display_name,full_name,avatar_url,email,phone,birthday,gender,archived"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("id", in_list),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<WorkspaceUserRow>>().map_err(|_| ())
}

/// Builds the `target_user` JSON object attached to each link row.
///
/// Private fields (email, phone, birthday, gender) are set to `null` and
/// `private_fields_hidden` is set to `true` when `can_view_private_info` is
/// `false`, matching the legacy `canViewPrivateInfo` guard.
///
/// NOTE: `avatar_url` is forwarded verbatim; the legacy
/// `normalizeAvatarImageSrc` URL transformation is not reproduced here (see
/// module-level behavior gap note).
fn build_target_user(user: &WorkspaceUserRow, can_view_private_info: bool) -> Value {
    let private_str = |v: &Option<String>| -> Value {
        if can_view_private_info {
            v.as_deref()
                .map_or(Value::Null, |s| Value::String(s.to_owned()))
        } else {
            Value::Null
        }
    };

    json!({
        "id": user.id,
        "display_name": user.display_name,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "email": private_str(&user.email),
        "phone": private_str(&user.phone),
        "birthday": private_str(&user.birthday),
        "gender": private_str(&user.gender),
        "archived": user.archived,
        "private_fields_hidden": !can_view_private_info,
    })
}

/// Sets `field` to `default` on the JSON object if the field is absent or null.
///
/// Mirrors the legacy JavaScript `?? true` default applied to
/// `prefill_existing_values` and `requires_auth`.
fn apply_bool_default(link: &mut Value, field: &str, default: bool) {
    if let Some(obj) = link.as_object_mut() {
        let is_null_or_absent = obj.get(field).is_none_or(Value::is_null);
        if is_null_or_absent {
            obj.insert(field.to_owned(), Value::Bool(default));
        }
    }
}

fn profile_links_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_links_ws_id_extracts_segment() {
        assert_eq!(
            profile_links_ws_id("/api/v1/workspaces/ws-abc/user-profile-links"),
            Some("ws-abc")
        );
        assert_eq!(
            profile_links_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/user-profile-links"
            ),
            Some("00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn profile_links_ws_id_rejects_other_paths() {
        // Wrong prefix (missing v1).
        assert_eq!(
            profile_links_ws_id("/api/workspaces/ws-abc/user-profile-links"),
            None
        );
        // Empty ws_id segment.
        assert_eq!(
            profile_links_ws_id("/api/v1/workspaces//user-profile-links"),
            None
        );
        // Extra path segment after the suffix.
        assert_eq!(
            profile_links_ws_id("/api/v1/workspaces/ws-abc/user-profile-links/extra"),
            None
        );
    }

    #[test]
    fn profile_links_ws_id_rejects_nested_segment() {
        // A slash inside what would be the ws_id segment must not match.
        assert_eq!(
            profile_links_ws_id("/api/v1/workspaces/a/b/user-profile-links"),
            None
        );
    }

    #[test]
    fn apply_bool_default_fills_null_with_true() {
        let mut link = json!({ "prefill_existing_values": null, "requires_auth": null });
        apply_bool_default(&mut link, "prefill_existing_values", true);
        apply_bool_default(&mut link, "requires_auth", true);
        assert_eq!(link["prefill_existing_values"], Value::Bool(true));
        assert_eq!(link["requires_auth"], Value::Bool(true));
    }

    #[test]
    fn apply_bool_default_fills_absent_field_with_true() {
        let mut link = json!({});
        apply_bool_default(&mut link, "prefill_existing_values", true);
        assert_eq!(link["prefill_existing_values"], Value::Bool(true));
    }

    #[test]
    fn apply_bool_default_preserves_false() {
        let mut link = json!({ "prefill_existing_values": false });
        apply_bool_default(&mut link, "prefill_existing_values", true);
        assert_eq!(link["prefill_existing_values"], Value::Bool(false));
    }

    #[test]
    fn build_target_user_hides_private_fields_when_denied() {
        let user = WorkspaceUserRow {
            id: Some("u1".to_owned()),
            display_name: Some("Alice".to_owned()),
            full_name: Some("Alice Smith".to_owned()),
            avatar_url: None,
            email: Some("alice@example.com".to_owned()),
            phone: Some("+1234".to_owned()),
            birthday: Some("1990-01-01".to_owned()),
            gender: Some("F".to_owned()),
            archived: Some(false),
        };
        let result = build_target_user(&user, false);
        assert_eq!(result["email"], Value::Null);
        assert_eq!(result["phone"], Value::Null);
        assert_eq!(result["birthday"], Value::Null);
        assert_eq!(result["gender"], Value::Null);
        assert_eq!(result["private_fields_hidden"], Value::Bool(true));
        assert_eq!(result["display_name"], json!("Alice"));
        assert_eq!(result["id"], json!("u1"));
    }

    #[test]
    fn build_target_user_exposes_private_fields_when_allowed() {
        let user = WorkspaceUserRow {
            id: Some("u2".to_owned()),
            display_name: None,
            full_name: None,
            avatar_url: Some("https://cdn.example.com/avatar.png".to_owned()),
            email: Some("bob@example.com".to_owned()),
            phone: Some("+9876".to_owned()),
            birthday: Some("1985-06-15".to_owned()),
            gender: Some("M".to_owned()),
            archived: None,
        };
        let result = build_target_user(&user, true);
        assert_eq!(result["email"], json!("bob@example.com"));
        assert_eq!(result["phone"], json!("+9876"));
        assert_eq!(result["birthday"], json!("1985-06-15"));
        assert_eq!(result["gender"], json!("M"));
        assert_eq!(result["private_fields_hidden"], Value::Bool(false));
        assert_eq!(
            result["avatar_url"],
            json!("https://cdn.example.com/avatar.png")
        );
    }
}
