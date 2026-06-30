//! Handler for `GET /api/v1/workspaces/:wsId/users/database`.
//!
//! Ports the GET handler from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/database/route.ts`.
//!
//! ## Auth
//!
//! The legacy route requires the caller to hold at least one of:
//!
//! - `view_users_public_info`
//! - `view_users_private_info`
//!
//! This handler calls `authorize_workspace_permission` up to twice to replicate
//! the OR check (the legacy calls `getPermissions` once).
//!
//! ## Behavior gaps vs legacy
//!
//! - `requireAttention` is accepted but always treated as `all` (skips the
//!   post-fetch `require_attention_users` query).
//! - `withPromotions` is not implemented (requires private-schema access).
//! - `is_guest` is not included per user (requires a `workspace_user_groups_users`
//!   join).
//! - `canCheckUserAttendance` is always `false`; `attendance_count` is removed.
//! - `avatar_url` is not normalized via `normalizeAvatarImageSrc`.
//! - POST falls through to Next.js (`None`).

use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/database";
const VIEW_USERS_PUBLIC_INFO: &str = "view_users_public_info";
const VIEW_USERS_PRIVATE_INFO: &str = "view_users_private_info";
const GET_WORKSPACE_USERS_RPC: &str = "get_workspace_users";
const DEFAULT_PAGE_SIZE: u32 = 10;
const MAX_PAGE_SIZE: u32 = 255;
const MAX_SEARCH_LENGTH: usize = 256;
const ERROR_MSG: &str = "Error fetching workspace users";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_users_database_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = users_database_ws_id(request.path)?;

    Some(match request.method {
        "GET" => users_database_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn users_database_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return message_response(500, ERROR_MSG);
    }

    // Try view_users_public_info first; if forbidden, fall back to private_info.
    let public_result = authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_USERS_PUBLIC_INFO,
        outbound,
    )
    .await;

    let (ws_id, has_public, has_private) = match public_result {
        Ok(auth) => {
            let has_private = authorize_workspace_permission(
                contact_data,
                request,
                raw_ws_id,
                VIEW_USERS_PRIVATE_INFO,
                outbound,
            )
            .await
            .is_ok();
            (auth.ws_id, true, has_private)
        }
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return no_store_response(json_response(
                404,
                json!({ "error": "Workspace not found" }),
            ));
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, ERROR_MSG);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            match authorize_workspace_permission(
                contact_data,
                request,
                raw_ws_id,
                VIEW_USERS_PRIVATE_INFO,
                outbound,
            )
            .await
            {
                Ok(auth) => (auth.ws_id, false, true),
                Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
                    return message_response(401, "Unauthorized");
                }
                Err(_) => return message_response(403, "Unauthorized"),
            }
        }
    };

    let params = parse_query_params(request.url);

    match fetch_workspace_users(contact_data, outbound, &ws_id, &params).await {
        Ok((users, count)) => {
            let data = users
                .into_iter()
                .map(|u| sanitize_user(u, has_public, has_private))
                .collect::<Vec<_>>();

            no_store_response(json_response(
                200,
                json!({
                    "data": data,
                    "count": count,
                    "permissions": {
                        "hasPrivateInfo": has_private,
                        "hasPublicInfo": has_public,
                        "canCheckUserAttendance": false,
                    }
                }),
            ))
        }
        Err(()) => message_response(500, ERROR_MSG),
    }
}

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

struct UsersDbParams {
    q: String,
    page: u32,
    page_size: u32,
    included_groups: Vec<String>,
    excluded_groups: Vec<String>,
    status: String,
    link_status: String,
    group_membership: String,
}

fn parse_query_params(url: Option<&str>) -> UsersDbParams {
    let pairs: Vec<(String, String)> = url
        .and_then(|u| url::Url::parse(u).ok())
        .map(|u| {
            u.query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect()
        })
        .unwrap_or_default();

    let get = |key: &str| pairs.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone());

    let get_list = |key: &str| -> Vec<String> {
        pairs
            .iter()
            .filter(|(k, _)| k == key)
            .flat_map(|(_, v)| v.split(',').map(|s| s.trim().to_owned()))
            .filter(|s| !s.is_empty())
            .collect()
    };

    let q = {
        let raw = get("q").unwrap_or_default();
        if raw.len() > MAX_SEARCH_LENGTH {
            raw[..MAX_SEARCH_LENGTH].to_owned()
        } else {
            raw
        }
    };
    let page = get("page")
        .and_then(|v| v.parse::<u32>().ok())
        .map(|v| v.max(1))
        .unwrap_or(1);
    let page_size = get("pageSize")
        .and_then(|v| v.parse::<u32>().ok())
        .map(|v| v.clamp(1, MAX_PAGE_SIZE))
        .unwrap_or(DEFAULT_PAGE_SIZE);
    let status = match get("status").as_deref() {
        Some("archived") => "archived".to_owned(),
        Some("archived_until") => "archived_until".to_owned(),
        Some("all") => "all".to_owned(),
        _ => "active".to_owned(),
    };
    let link_status = match get("linkStatus").as_deref() {
        Some("linked") => "linked".to_owned(),
        Some("virtual") => "virtual".to_owned(),
        _ => "all".to_owned(),
    };
    let group_membership = match get("groupMembership").as_deref() {
        Some("at-least-one") => "at-least-one".to_owned(),
        Some("exactly-one") => "exactly-one".to_owned(),
        Some("none") => "none".to_owned(),
        _ => "all".to_owned(),
    };

    UsersDbParams {
        q,
        page,
        page_size,
        included_groups: get_list("includedGroups"),
        excluded_groups: get_list("excludedGroups"),
        status,
        link_status,
        group_membership,
    }
}

// ---------------------------------------------------------------------------
// RPC fetch
// ---------------------------------------------------------------------------

async fn fetch_workspace_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &UsersDbParams,
) -> Result<(Vec<Value>, i64), ()> {
    let base_rpc_url = contact_data.rpc_url(GET_WORKSPACE_USERS_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;

    let query_string = {
        let mut qp = url::form_urlencoded::Serializer::new(String::new());
        qp.append_pair("select", "*");
        qp.append_pair("order", "full_name.asc.nullslast");
        match params.status.as_str() {
            "archived" => {
                qp.append_pair("archived", "eq.true");
                qp.append_pair("archived_until", "is.null");
            }
            "archived_until" => {
                let now = current_iso_timestamp();
                qp.append_pair("archived_until", &format!("gt.{now}"));
            }
            _ => {}
        }
        qp.finish()
    };
    let url = format!("{base_rpc_url}?{query_string}");

    let include_archived = params.status != "active";
    let body = json!({
        "_ws_id": ws_id,
        "included_groups": params.included_groups,
        "excluded_groups": params.excluded_groups,
        "search_query": params.q,
        "include_archived": include_archived,
        "link_status": params.link_status,
        "group_membership": params.group_membership,
    })
    .to_string();

    let start = (params.page - 1) * params.page_size;
    let end = params.page * params.page_size - 1;
    let range_value = format!("{start}-{end}");
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "count=exact")
                .with_header("Range", &range_value)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Extract total count from PostgREST Content-Range: {first}-{last}/{total}.
    let count: i64 = response
        .header("Content-Range")
        .and_then(|cr| cr.rsplit_once('/').map(|(_, n)| n))
        .filter(|n| *n != "*")
        .and_then(|n| n.parse().ok())
        .unwrap_or(0);

    let users = response.json::<Vec<Value>>().map_err(|_| ())?;
    Ok((users, count))
}

// ---------------------------------------------------------------------------
// Field sanitization
// ---------------------------------------------------------------------------

fn sanitize_user(mut user: Value, has_public: bool, has_private: bool) -> Value {
    let Some(obj) = user.as_object_mut() else {
        return user;
    };

    if has_private {
        let archived = obj
            .get("archived")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let has_archived_until = obj
            .get("archived_until")
            .map(|v| !v.is_null())
            .unwrap_or(false);
        let archival_note = if archived || has_archived_until {
            obj.get("note")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| Value::String(s.to_owned()))
                .unwrap_or(Value::Null)
        } else {
            Value::Null
        };
        obj.insert("archival_note".to_owned(), archival_note);
    }

    if !has_private {
        for f in [
            "email",
            "phone",
            "birthday",
            "gender",
            "ethnicity",
            "guardian",
            "national_id",
            "address",
            "note",
            "archival_note",
        ] {
            obj.remove(f);
        }
    }
    if !has_public {
        for f in [
            "avatar_url",
            "full_name",
            "display_name",
            "group_count",
            "linked_users",
            "created_at",
            "updated_at",
        ] {
            obj.remove(f);
        }
    }
    obj.remove("attendance_count");
    user
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn users_database_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Returns the current UTC time as `YYYY-MM-DDTHH:MM:SS.000Z` without
/// pulling in a date/time crate (mirrors the private `contact::datetime`
/// helper).
fn current_iso_timestamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let (y, mo, d) = civil_from_days((secs / 86_400) as i64);
    let s = secs % 86_400;
    format!(
        "{y:04}-{mo:02}-{d:02}T{:02}:{:02}:{:02}.000Z",
        s / 3600,
        (s % 3600) / 60,
        s % 60
    )
}

/// Howard Hinnant's civil_from_days: days since Unix epoch → (year, month, day).
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mp = mp as i32;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    (y as i32, m as u32, d as u32)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests (pure/sync helpers only)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route() {
        let ws = "11111111-1111-4111-8111-111111111111";
        assert_eq!(
            users_database_ws_id(&format!("/api/v1/workspaces/{ws}/users/database")),
            Some(ws)
        );
    }

    #[test]
    fn path_guard_rejects_extra_segment_and_wrong_suffix() {
        let ws = "11111111-1111-4111-8111-111111111111";
        assert!(
            users_database_ws_id(&format!("/api/v1/workspaces/{ws}/users/database/x")).is_none()
        );
        assert!(users_database_ws_id(&format!("/api/v1/workspaces/{ws}/other/database")).is_none());
        assert!(users_database_ws_id("/api/v1/workspaces//users/database").is_none());
        assert!(users_database_ws_id("/api/v1/workspaces/a/b/users/database").is_none());
    }

    #[test]
    fn parse_defaults_when_no_params() {
        let p = parse_query_params(Some("https://x.com/path"));
        assert_eq!(p.q, "");
        assert_eq!(p.page, 1);
        assert_eq!(p.page_size, 10);
        assert!(p.included_groups.is_empty());
        assert_eq!(p.status, "active");
        assert_eq!(p.link_status, "all");
        assert_eq!(p.group_membership, "all");
    }

    #[test]
    fn parse_valid_params_and_clamp() {
        let p = parse_query_params(Some(
            "https://x.com/?q=alice&page=2&pageSize=9999&status=archived&linkStatus=linked&groupMembership=at-least-one",
        ));
        assert_eq!(p.q, "alice");
        assert_eq!(p.page, 2);
        assert_eq!(p.page_size, MAX_PAGE_SIZE);
        assert_eq!(p.status, "archived");
        assert_eq!(p.link_status, "linked");
        assert_eq!(p.group_membership, "at-least-one");
    }

    #[test]
    fn parse_included_groups_comma_and_multi() {
        let p = parse_query_params(Some("https://x.com/?includedGroups=a,b"));
        assert_eq!(p.included_groups, vec!["a", "b"]);
        let p2 = parse_query_params(Some("https://x.com/?includedGroups=a&includedGroups=b"));
        assert_eq!(p2.included_groups, vec!["a", "b"]);
    }

    #[test]
    fn sanitize_removes_private_when_no_permission() {
        let user = json!({"id":"u1","full_name":"Alice","email":"a@b.com","attendance_count":5});
        let r = sanitize_user(user, true, false);
        assert!(r.get("full_name").is_some());
        assert!(r.get("email").is_none());
        assert!(r.get("attendance_count").is_none());
    }

    #[test]
    fn sanitize_removes_public_when_no_permission() {
        let user = json!({"id":"u1","full_name":"Alice","email":"a@b.com"});
        let r = sanitize_user(user, false, true);
        assert!(r.get("full_name").is_none());
        assert!(r.get("email").is_some());
    }

    #[test]
    fn sanitize_adds_archival_note_for_archived_user() {
        let user = json!({"id":"u1","archived":true,"archived_until":null,"note":"  reason  "});
        let r = sanitize_user(user, true, true);
        assert_eq!(r["archival_note"], json!("reason"));
    }

    #[test]
    fn sanitize_archival_note_null_when_active() {
        let user = json!({"id":"u1","archived":false,"archived_until":null,"note":"misc"});
        let r = sanitize_user(user, true, true);
        assert_eq!(r["archival_note"], json!(null));
    }

    #[test]
    fn civil_from_days_epoch_and_known_date() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        // 2024-01-01 is 19723 days after Unix epoch.
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
    }
}
