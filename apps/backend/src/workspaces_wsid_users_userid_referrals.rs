//! Handler for `GET /api/v1/workspaces/:wsId/users/:userId/referrals`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/[userId]/referrals/route.ts`.
//! GET only; POST and DELETE return `None` (fall through to Next.js).
//!
//! ## Auth
//!
//! The legacy `getPermissions` call maps to `authorize_workspace_permission`
//! with `update_users`:
//!
//! - `Unauthorized` / `NotFound` -> `401 { "message": "Unauthorized" }`
//! - `Forbidden` + `type=available` -> `403 { "message": "Forbidden" }`
//! - `Forbidden` + `type=list` -> proceed (caller is a workspace member)
//! - `Ok` -> proceed with normalized `ws_id`
//! - `Internal` -> `500`
//!
//! ## Behavior gaps
//!
//! 1. **Unicode search** (`type=available`): The legacy `matchesWorkspaceUserSearch`
//!    applies full Unicode NFD decomposition and combining-mark stripping. This port
//!    applies only ASCII lowercasing and `đ`/`Đ` -> `d` substitution; queries with
//!    other diacritics (e.g. `ắ`) will not be normalized identically.
//! 2. **ws_id for data queries under `Forbidden`** (`type=list` only): the raw
//!    path `wsId` (not the normalized UUID) is used. In practice this route is
//!    always called with a UUID `wsId`, so behavior is equivalent.

use std::collections::HashSet;

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

const UPDATE_USERS_PERMISSION: &str = "update_users";
const UNAUTHORIZED_MSG: &str = "Unauthorized";
const FORBIDDEN_MSG: &str = "Forbidden";
const LIST_ERROR_MSG: &str = "Error fetching referred users";
const AVAILABLE_ERROR_MSG: &str = "Error fetching available referral users";
const TYPE_AVAILABLE: &str = "available";

#[derive(Deserialize)]
struct RequireAttentionRow {
    user_id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_users_userid_referrals_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, user_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => referrals_get(config, request, raw_ws_id, user_id, outbound).await,
        _ => return None,
    })
}

async fn referrals_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let (query_type, query_q) = parse_query_params(request.url);
    let is_available = query_type.as_deref() == Some(TYPE_AVAILABLE);

    let ws_id = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        UPDATE_USERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth.ws_id,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => return message_response(401, UNAUTHORIZED_MSG),
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            if is_available {
                return message_response(403, FORBIDDEN_MSG);
            }
            // type=list: caller is an authenticated workspace member.
            raw_ws_id.to_owned()
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, LIST_ERROR_MSG);
        }
    };

    if is_available {
        fetch_available(
            &config.contact_data,
            outbound,
            &ws_id,
            user_id,
            query_q.as_deref(),
        )
        .await
    } else {
        fetch_list(&config.contact_data, outbound, &ws_id, user_id).await
    }
}

async fn fetch_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            (
                "select",
                "id,full_name,display_name,email,phone,avatar_url".to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            ("referred_by", format!("eq.{user_id}")),
            ("archived", "eq.false".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return message_response(500, LIST_ERROR_MSG);
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return message_response(500, LIST_ERROR_MSG);
    };
    let bearer = format!("Bearer {service_role_key}");

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact"),
        )
        .await
    else {
        return message_response(500, LIST_ERROR_MSG);
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, LIST_ERROR_MSG);
    }

    let count = response
        .header("content-range")
        .and_then(parse_content_range_count)
        .unwrap_or(0i64);

    let Ok(users) = response.json::<Vec<Value>>() else {
        return message_response(500, LIST_ERROR_MSG);
    };

    let user_ids: Vec<String> = users
        .iter()
        .filter_map(|u| u.get("id")?.as_str().map(str::to_owned))
        .collect();

    let require_attention = if user_ids.is_empty() {
        HashSet::new()
    } else {
        fetch_require_attention(contact_data, outbound, ws_id, &user_ids).await
    };

    let data: Vec<Value> = attach_attention_flag(users, &require_attention);
    no_store_response(json_response(200, json!({ "data": data, "count": count })))
}

async fn fetch_available(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    current_user_id: &str,
    q: Option<&str>,
) -> BackendResponse {
    // Step 1: get the current user's referred_by (to exclude that referrer).
    let exclude_referrer =
        match fetch_user_referred_by(contact_data, outbound, ws_id, current_user_id).await {
            Ok(Some(v)) => v,
            Ok(None) => return no_store_response(json_response(200, json!([]))),
            Err(()) => return message_response(500, AVAILABLE_ERROR_MSG),
        };

    // Step 2: query candidates.
    let candidates = match fetch_candidates(
        contact_data,
        outbound,
        ws_id,
        current_user_id,
        exclude_referrer.as_deref(),
    )
    .await
    {
        Ok(c) => c,
        Err(()) => return message_response(500, AVAILABLE_ERROR_MSG),
    };

    // Step 3: in-memory search filter (mirrors legacy matchesWorkspaceUserSearch).
    let filtered: Vec<Value> = candidates
        .into_iter()
        .filter(|u| matches_search(u, q))
        .collect();

    // Step 4: annotate with require-attention flag.
    let user_ids: Vec<String> = filtered
        .iter()
        .filter_map(|u| u.get("id")?.as_str().map(str::to_owned))
        .collect();

    let require_attention = if user_ids.is_empty() {
        HashSet::new()
    } else {
        fetch_require_attention(contact_data, outbound, ws_id, &user_ids).await
    };

    let result = attach_attention_flag(filtered, &require_attention);
    no_store_response(json_response(200, result))
}

/// Returns the `referred_by` UUID for `current_user_id`, or `None` if the user
/// does not exist in the workspace. The legacy returns `[]` in that case.
async fn fetch_user_referred_by(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<Option<String>>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "referred_by".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
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

    // Parse as generic JSON to handle nullable referred_by.
    let rows = response.json::<Vec<Value>>().map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(None);
    };

    let referred_by = row
        .get("referred_by")
        .and_then(Value::as_str)
        .map(str::to_owned);

    Ok(Some(referred_by))
}

async fn fetch_candidates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    current_user_id: &str,
    exclude_referrer_id: Option<&str>,
) -> Result<Vec<Value>, ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "id,full_name,display_name,email,phone".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("archived", "eq.false".to_owned()),
        ("id", format!("neq.{current_user_id}")),
        ("referred_by", "is.null".to_owned()),
        ("order", "full_name.asc.nullslast".to_owned()),
    ];
    if let Some(referrer_id) = exclude_referrer_id {
        params.push(("id", format!("neq.{referrer_id}")));
    }

    let Some(url) = contact_data.rest_url("workspace_users", &params) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
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

async fn fetch_require_attention(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> HashSet<String> {
    let Some(rpc_url) = contact_data.rpc_url("get_workspace_users_require_attention") else {
        return HashSet::new();
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return HashSet::new();
    };
    let bearer = format!("Bearer {service_role_key}");
    let Ok(body) = serde_json::to_string(&json!({ "p_ws_id": ws_id, "p_user_ids": user_ids }))
    else {
        return HashSet::new();
    };

    let Ok(response) = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
    else {
        return HashSet::new();
    };

    if !(200..300).contains(&response.status) {
        return HashSet::new();
    }

    response
        .json::<Vec<RequireAttentionRow>>()
        .map(|rows| {
            rows.into_iter()
                .filter_map(|r| r.user_id)
                .filter(|id| !id.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn attach_attention_flag(users: Vec<Value>, require_attention: &HashSet<String>) -> Vec<Value> {
    users
        .into_iter()
        .map(|mut user| {
            let flag = user
                .get("id")
                .and_then(Value::as_str)
                .map(|id| require_attention.contains(id))
                .unwrap_or(false);
            if let Some(obj) = user.as_object_mut() {
                obj.insert(
                    "has_require_attention_feedback".to_owned(),
                    Value::Bool(flag),
                );
            }
            user
        })
        .collect()
}

fn matches_search(user: &Value, q: Option<&str>) -> bool {
    let normalized_q = normalize_search_text(q.unwrap_or(""));
    if normalized_q.is_empty() {
        return true;
    }

    let raw: String = [
        user.get("full_name").and_then(Value::as_str),
        user.get("display_name").and_then(Value::as_str),
        user.get("email").and_then(Value::as_str),
        user.get("phone").and_then(Value::as_str),
    ]
    .iter()
    .filter_map(|f| *f)
    .collect::<Vec<_>>()
    .join(" ");

    let haystack = normalize_search_text(&raw);
    let mut start = 0usize;

    for token in normalized_q.split(' ') {
        if token.is_empty() {
            continue;
        }
        match haystack[start..].find(token) {
            Some(pos) => start += pos + token.len(),
            None => return false,
        }
    }
    true
}

/// Lowercases, replaces `đ`/`Đ` -> `d`, and collapses whitespace.
fn normalize_search_text(input: &str) -> String {
    let s = input.replace(['đ', 'Đ'], "d");
    s.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Extracts `(raw_ws_id, user_id)` from
/// `/api/v1/workspaces/:wsId/users/:userId/referrals`.
///
/// Expected segments (0-indexed):
///
/// - 0: `api`, 1: `v1`, 2: `workspaces`, 3: `:wsId`
/// - 4: `users`, 5: `:userId`, 6: `referrals`
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let segments = path_segments(path);

    if segments.len() != 7 {
        return None;
    }

    let ws_id = segments.get(3)?;
    let user_id = segments.get(5)?;

    if segments[0] != "api"
        || segments[1] != "v1"
        || segments[2] != "workspaces"
        || ws_id.is_empty()
        || segments[4] != "users"
        || user_id.is_empty()
        || segments[6] != "referrals"
    {
        return None;
    }

    Some((ws_id, user_id))
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

fn parse_query_params(url: Option<&str>) -> (Option<String>, Option<String>) {
    let Some(url) = url else {
        return (None, None);
    };
    let Some(query) = url.split_once('?').map(|(_, q)| q) else {
        return (None, None);
    };

    let mut type_val: Option<String> = None;
    let mut q_val: Option<String> = None;

    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        match key {
            "type" if !value.is_empty() => type_val = Some(value.replace('+', " ")),
            "q" => q_val = Some(value.replace('+', " ")),
            _ => {}
        }
    }

    (type_val, q_val)
}

fn parse_content_range_count(content_range: &str) -> Option<i64> {
    content_range.split('/').nth(1)?.trim().parse::<i64>().ok()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- Path extraction -------------------------------------------------------

    #[test]
    fn extract_canonical_path() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let uid = "22222222-2222-4222-8222-222222222222";
        let path = format!("/api/v1/workspaces/{ws}/users/{uid}/referrals");
        assert_eq!(extract_path_params(&path), Some((ws, uid)));
    }

    #[test]
    fn extract_path_slug_ws_id() {
        let path = "/api/v1/workspaces/personal/users/some-user/referrals";
        let (ws_id, user_id) = extract_path_params(path).expect("should match");
        assert_eq!(ws_id, "personal");
        assert_eq!(user_id, "some-user");
    }

    #[test]
    fn extract_path_rejects_wrong_segment_count() {
        assert!(extract_path_params("/api/v1/workspaces/ws-1/users/referrals").is_none());
        assert!(extract_path_params("/api/v1/workspaces/ws-1/users/uid/referrals/extra").is_none());
        assert!(extract_path_params("/api/v1/health").is_none());
    }

    #[test]
    fn extract_path_rejects_wrong_static_segments() {
        assert!(extract_path_params("/api/workspaces/ws-1/users/uid/referrals").is_none());
        assert!(extract_path_params("/api/v1/workspaces/ws-1/groups/uid/referrals").is_none());
        assert!(extract_path_params("/api/v1/workspaces/ws-1/users/uid/referral").is_none());
    }

    #[test]
    fn extract_path_rejects_empty_dynamic_segments() {
        assert!(extract_path_params("/api/v1/workspaces//users/uid/referrals").is_none());
        assert!(extract_path_params("/api/v1/workspaces/ws-1/users//referrals").is_none());
    }

    // -- Content-Range parsing -------------------------------------------------

    #[test]
    fn content_range_parses_standard_formats() {
        assert_eq!(parse_content_range_count("0-24/300"), Some(300));
        assert_eq!(parse_content_range_count("*/0"), Some(0));
        assert_eq!(parse_content_range_count("0-0/1"), Some(1));
    }

    #[test]
    fn content_range_returns_none_for_malformed() {
        assert_eq!(parse_content_range_count("bad"), None);
        assert_eq!(parse_content_range_count("0-24/abc"), None);
        assert_eq!(parse_content_range_count(""), None);
    }

    // -- Search normalization --------------------------------------------------

    #[test]
    fn normalize_lowercases_and_replaces_d_stroke() {
        // ASCII lowercasing.
        assert_eq!(normalize_search_text("HELLO"), "hello");
        // đ (U+0111) and Đ (U+0110) are both mapped to d.
        assert_eq!(normalize_search_text("đ"), "d");
        assert_eq!(normalize_search_text("Đ"), "d");
        // Whitespace collapsing.
        assert_eq!(normalize_search_text("  foo   bar  "), "foo bar");
        assert_eq!(normalize_search_text(""), "");
    }

    #[test]
    fn matches_search_empty_query_always_matches() {
        let user = json!({ "id": "u1", "full_name": "Alice" });
        assert!(matches_search(&user, None));
        assert!(matches_search(&user, Some("")));
    }

    #[test]
    fn matches_search_ascii_token_match() {
        let user = json!({ "id": "u1", "full_name": "Alice Smith", "email": "alice@example.com" });
        assert!(matches_search(&user, Some("alice")));
        assert!(matches_search(&user, Some("ALICE")));
        assert!(matches_search(&user, Some("smith")));
        assert!(!matches_search(&user, Some("bob")));
    }

    #[test]
    fn matches_search_sequential_tokens_in_order() {
        let user = json!({ "id": "u1", "full_name": "Alice Bob Smith" });
        assert!(matches_search(&user, Some("alice smith")));
        // Tokens must appear sequentially left-to-right.
        assert!(!matches_search(&user, Some("smith alice")));
    }

    // -- Query param parsing ---------------------------------------------------

    #[test]
    fn parse_query_params_returns_none_for_absent_url() {
        assert_eq!(parse_query_params(None), (None, None));
    }

    #[test]
    fn parse_query_params_type_available() {
        let url = "https://example.com/path?type=available&q=foo";
        let (type_val, q_val) = parse_query_params(Some(url));
        assert_eq!(type_val.as_deref(), Some("available"));
        assert_eq!(q_val.as_deref(), Some("foo"));
    }

    #[test]
    fn parse_query_params_type_list_default() {
        let url = "https://example.com/path?type=list";
        let (type_val, _) = parse_query_params(Some(url));
        assert_eq!(type_val.as_deref(), Some("list"));
    }

    #[test]
    fn parse_query_params_plus_decoding() {
        let (_, q_val) = parse_query_params(Some("https://example.com/path?q=hello+world"));
        assert_eq!(q_val.as_deref(), Some("hello world"));
    }
}
