//! Port of `GET /api/v1/users/me/task-boards`.
//!
//! Legacy: `apps/web/src/app/api/v1/users/me/task-boards/route.ts`.
//! Auth: `withSessionAuth` — Supabase session (Bearer token or auth cookie),
//! no app-session tokens. All Supabase reads use the service-role key
//! (mirroring `createAdminClient({ noCookie: true })`).
//!
//! Response: `200 { "boards": [...] }` sorted by workspace name then board
//! name. Each board carries `access_type`, `guest_permission`, and a nested
//! `workspace` summary matching the legacy `AccessibleTaskBoard` shape.
//!
//! # Behavior gaps
//!
//! - **`manage_projects` check skipped.** The legacy route calls
//!   `getPermissions` for each member workspace and only surfaces boards
//!   from workspaces where the caller has `manage_projects`. This
//!   per-workspace permission chain is not reproduced; all member-workspace
//!   boards are returned (slightly less restrictive).
//!
//! - `normalizeTaskBoardShareEmail` is reproduced inline (trim → lowercase →
//!   `None` unless result contains `@`).
//!
//! - `strongestTaskBoardGuestPermission` rank order (`manage > edit >
//!   comment > view`) is reproduced inline.
//!
//! - `withSessionAuth` cross-cutting controls (IP blocks, rate limiting,
//!   suspension checks) are not reproduced.

use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{HashMap, hash_map::Entry};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const TASK_BOARDS_PATH: &str = "/api/v1/users/me/task-boards";

const UNAUTHORIZED: &str = "Unauthorized";
const WORKSPACE_ACCESS_ERROR: &str = "Failed to fetch workspace access";
const BOARDS_ACCESS_ERROR: &str = "Failed to fetch accessible task boards";
const INTERNAL_ERROR: &str = "Internal server error";

const BOARD_SELECT: &str = "id,ws_id,name,icon,ticket_prefix,archived_at,deleted_at,\
    created_at,workspaces!inner(id,name,personal,avatar_url,logo_url,creator_id)";

const SHARE_SELECT: &str = "board_id,permission,workspace_boards!inner(id,ws_id,name,\
    icon,ticket_prefix,archived_at,deleted_at,created_at,\
    workspaces!inner(id,name,personal,avatar_url,logo_url,creator_id))";

const MEMBER_SELECT: &str =
    "ws_id,workspaces!inner(id,name,personal,avatar_url,logo_url,creator_id)";

pub(crate) async fn handle_users_me_task_boards_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != TASK_BOARDS_PATH {
        return None;
    }
    Some(match request.method {
        "GET" => task_boards_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn task_boards_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return err(500, INTERNAL_ERROR);
    }
    let Some(token) = supabase_auth::request_access_token(request) else {
        return err(401, UNAUTHORIZED);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &token, outbound).await
    else {
        return err(401, UNAUTHORIZED);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return err(401, UNAUTHORIZED);
    };
    let Some(srk) = config.contact_data.service_role_key() else {
        return err(500, INTERNAL_ERROR);
    };

    // 1. Workspace memberships (manage_projects check omitted — see module doc).
    let member_rows =
        match fetch_member_workspaces(&config.contact_data, outbound, srk, &user_id).await {
            Ok(rows) => rows,
            Err(()) => return err(500, WORKSPACE_ACCESS_ERROR),
        };

    let ws_ids: Vec<String> = {
        let mut seen = std::collections::HashSet::new();
        member_rows
            .iter()
            .filter_map(|r| r.get("ws_id")?.as_str().map(str::to_owned))
            .filter(|id| seen.insert(id.clone()))
            .collect()
    };

    // 2. Member boards.
    let mut boards_by_id: HashMap<String, Value> = HashMap::new();
    if !ws_ids.is_empty() {
        let board_rows =
            match fetch_member_boards(&config.contact_data, outbound, srk, &ws_ids).await {
                Ok(rows) => rows,
                Err(()) => return err(500, BOARDS_ACCESS_ERROR),
            };
        for row in &board_rows {
            let Some(ws) = joined_one(row.get("workspaces")) else {
                continue;
            };
            let Some(id) = row.get("id").and_then(Value::as_str).map(str::to_owned) else {
                continue;
            };
            if let Some(b) = build_board(row, ws, &user_id, "member", None) {
                boards_by_id.insert(id, b);
            }
        }
    }

    // 3. User email for guest-share lookup.
    let user_email = resolve_email(
        &config.contact_data,
        outbound,
        srk,
        &user_id,
        user.email.as_deref(),
    )
    .await;

    // 4. Guest shares (by user_id, then by email).
    let mut share_rows: Vec<Value> = Vec::new();
    if let Ok(rows) = fetch_shares(
        &config.contact_data,
        outbound,
        srk,
        "shared_with_user_id",
        &user_id,
    )
    .await
    {
        share_rows.extend(rows);
    }
    if let Some(ref email) = user_email
        && let Ok(rows) = fetch_shares(
            &config.contact_data,
            outbound,
            srk,
            "shared_with_email",
            email,
        )
        .await
    {
        share_rows.extend(rows);
    }

    // 5. Strongest permission per board across all shares.
    let mut strongest: HashMap<String, String> = HashMap::new();
    for row in &share_rows {
        let Some(bid) = row.get("board_id").and_then(Value::as_str) else {
            continue;
        };
        let Some(perm) = row.get("permission").and_then(Value::as_str) else {
            continue;
        };
        match strongest.entry(bid.to_owned()) {
            Entry::Occupied(mut e) => {
                if perm_rank(perm) > perm_rank(e.get().as_str()) {
                    e.insert(perm.to_owned());
                }
            }
            Entry::Vacant(e) => {
                e.insert(perm.to_owned());
            }
        }
    }

    // 6. Guest boards (member boards take priority).
    for row in &share_rows {
        let Some(perm) = row.get("permission").and_then(Value::as_str) else {
            continue;
        };
        let Some(board_row) = row
            .get("workspace_boards")
            .and_then(|v| joined_one(Some(v)))
        else {
            continue;
        };
        let bid = row
            .get("board_id")
            .and_then(Value::as_str)
            .or_else(|| board_row.get("id").and_then(Value::as_str));
        let Some(bid) = bid.map(str::to_owned) else {
            continue;
        };
        if boards_by_id.contains_key(&bid) {
            continue;
        }
        let Some(ws) = joined_one(board_row.get("workspaces")) else {
            continue;
        };
        let effective = strongest.get(&bid).map(String::as_str).unwrap_or(perm);
        if let Some(b) = build_board(board_row, ws, &user_id, "guest", Some(effective)) {
            boards_by_id.insert(bid, b);
        }
    }

    // 7. Sort by workspace name then board name, and return.
    let mut boards: Vec<Value> = boards_by_id.into_values().collect();
    fn ws_name(v: &Value) -> &str {
        v.get("workspace")
            .and_then(|ws| ws.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("")
    }
    boards.sort_by(|a, b| {
        ws_name(a).cmp(ws_name(b)).then_with(|| {
            a.get("name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .cmp(b.get("name").and_then(Value::as_str).unwrap_or(""))
        })
    });

    no_store_response(json_response(200, json!({ "boards": boards })))
}

// ---------------------------------------------------------------------------
// Supabase reads (all use service-role key)
// ---------------------------------------------------------------------------

async fn fetch_member_workspaces(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = cd
        .rest_url(
            "workspace_members",
            &[
                ("select", MEMBER_SELECT.to_owned()),
                ("user_id", format!("eq.{user_id}")),
            ],
        )
        .ok_or(())?;
    svc_get(outbound, &url, srk).await
}

async fn fetch_member_boards(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    ws_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let url = cd
        .rest_url(
            "workspace_boards",
            &[
                ("select", BOARD_SELECT.to_owned()),
                ("ws_id", format!("in.({})", ws_ids.join(","))),
                ("archived_at", "is.null".to_owned()),
                ("deleted_at", "is.null".to_owned()),
            ],
        )
        .ok_or(())?;
    svc_get(outbound, &url, srk).await
}

/// Fetches `task_board_shares` filtered by `column = eq.<value>`.
///
/// Used for both `shared_with_user_id` and `shared_with_email` lookups
/// (mirrors the two `applyBoardFilters` calls in `loadGuestShareRows`).
async fn fetch_shares(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    column: &str,
    value: &str,
) -> Result<Vec<Value>, ()> {
    let url = cd
        .rest_url(
            "task_board_shares",
            &[
                ("select", SHARE_SELECT.to_owned()),
                (column, format!("eq.{value}")),
                ("workspace_boards.deleted_at", "is.null".to_owned()),
                ("workspace_boards.archived_at", "is.null".to_owned()),
            ],
        )
        .ok_or(())?;
    svc_get(outbound, &url, srk).await
}

/// Resolves the caller's normalized email for guest-share lookup (mirrors
/// `getUserEmail`). Tries the auth email first; falls back to
/// `user_private_details`.
async fn resolve_email(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    srk: &str,
    user_id: &str,
    auth_email: Option<&str>,
) -> Option<String> {
    if let Some(e) = normalize_email(auth_email) {
        return Some(e);
    }
    let url = cd.rest_url(
        "user_private_details",
        &[
            ("select", "email".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    )?;
    let bearer = format!("Bearer {srk}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", srk),
        )
        .await
        .ok()?;
    if !(200..300).contains(&resp.status) {
        return None;
    }
    #[derive(Deserialize)]
    struct Row {
        email: Option<String>,
    }
    normalize_email(
        resp.json::<Vec<Row>>()
            .ok()?
            .into_iter()
            .next()?
            .email
            .as_deref(),
    )
}

async fn svc_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    srk: &str,
) -> Result<Vec<Value>, ()> {
    let bearer = format!("Bearer {srk}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Returns the first array element or the value itself when it is an object.
/// Mirrors `joinedOne` from the legacy route.
fn joined_one(v: Option<&Value>) -> Option<&Value> {
    match v? {
        Value::Array(arr) => arr.first(),
        obj @ Value::Object(_) => Some(obj),
        _ => None,
    }
}

/// Trim → lowercase → `None` unless result contains `@`.
/// Mirrors `normalizeTaskBoardShareEmail`.
fn normalize_email(email: Option<&str>) -> Option<String> {
    let s = email?.trim().to_lowercase();
    s.contains('@').then_some(s)
}

/// Numeric rank for `strongestTaskBoardGuestPermission` ordering.
fn perm_rank(perm: &str) -> u8 {
    match perm {
        "manage" => 4,
        "edit" => 3,
        "comment" => 2,
        "view" => 1,
        _ => 0,
    }
}

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// Builds an `AccessibleTaskBoard` JSON value (mirrors `normalizeBoard`).
/// Returns `None` when `row.id` or `row.ws_id` is absent.
fn build_board(
    row: &Value,
    ws: &Value,
    user_id: &str,
    access_type: &str,
    guest_perm: Option<&str>,
) -> Option<Value> {
    let board_id = row.get("id")?.as_str()?;
    let ws_id = row.get("ws_id")?.as_str()?;
    let workspace = build_workspace(ws, user_id, access_type, guest_perm)?;
    // guest_permission defaults to "view" when absent (mirrors `guestPermission ?? 'view'`).
    let guest_permission: Value = if access_type == "guest" {
        json!(guest_perm.unwrap_or("view"))
    } else {
        Value::Null
    };
    Some(json!({
        "id":               board_id,
        "ws_id":            ws_id,
        "name":             row.get("name").cloned().unwrap_or(Value::Null),
        "icon":             row.get("icon").cloned().unwrap_or(Value::Null),
        "ticket_prefix":    row.get("ticket_prefix").cloned().unwrap_or(Value::Null),
        "archived_at":      row.get("archived_at").cloned().unwrap_or(Value::Null),
        "deleted_at":       row.get("deleted_at").cloned().unwrap_or(Value::Null),
        "created_at":       row.get("created_at").cloned().unwrap_or(Value::Null),
        "access_type":      access_type,
        "guest_permission": guest_permission,
        "workspace":        workspace,
    }))
}

/// Builds an `InternalApiWorkspaceSummary` JSON value (mirrors
/// `normalizeWorkspaceSummary`). Returns `None` when `ws.id` is absent.
fn build_workspace(
    ws: &Value,
    user_id: &str,
    access_type: &str,
    guest_perm: Option<&str>,
) -> Option<Value> {
    let id = ws.get("id")?.as_str()?;
    let personal = ws.get("personal").and_then(Value::as_bool).unwrap_or(false);
    let name: String = ws
        .get("name")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            if personal {
                "Personal".to_owned()
            } else {
                "Untitled".to_owned()
            }
        });
    let created_by_me = ws.get("creator_id").and_then(Value::as_str) == Some(user_id);
    let mut out = json!({
        "id":            id,
        "name":          name,
        "personal":      personal,
        "avatar_url":    ws.get("avatar_url").cloned().unwrap_or(Value::Null),
        "logo_url":      ws.get("logo_url").cloned().unwrap_or(Value::Null),
        "created_by_me": created_by_me,
        "access_type":   access_type,
    });
    if access_type == "guest" {
        // `normalizeBoard` never passes `guestBoardCount`; defaults to 1,
        // so `guest_landing_path` is always null (count === 1 ? null : '/tasks/boards').
        let perm = guest_perm.unwrap_or("view");
        out["guest_board_count"] = json!(1);
        out["guest_highest_permission"] = json!(perm);
        out["guest_landing_path"] = Value::Null;
        out["guest_products"] = json!(["tasks"]);
    }
    Some(out)
}

// ---------------------------------------------------------------------------
// Tests (pure / sync helpers only — no async handler calls)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn req(method: &'static str, path: &'static str) -> crate::BackendRequest<'static> {
        crate::BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: None,
        }
    }

    #[test]
    fn path_guard_exact_match_only() {
        assert_eq!(req("GET", TASK_BOARDS_PATH).path, TASK_BOARDS_PATH);
        assert_ne!("/api/v1/users/me/task-boards/extra", TASK_BOARDS_PATH);
        assert_ne!("/api/users/me/task-boards", TASK_BOARDS_PATH);
    }

    #[test]
    fn perm_rank_ordering() {
        assert!(perm_rank("manage") > perm_rank("edit"));
        assert!(perm_rank("edit") > perm_rank("comment"));
        assert!(perm_rank("comment") > perm_rank("view"));
        assert!(perm_rank("view") > perm_rank("unknown"));
        assert_eq!(perm_rank(""), 0);
    }

    #[test]
    fn normalize_email_cases() {
        assert_eq!(
            normalize_email(Some("  Ada@Example.COM  ")),
            Some("ada@example.com".to_owned())
        );
        assert_eq!(normalize_email(Some("notanemail")), None);
        assert_eq!(normalize_email(Some("")), None);
        assert_eq!(normalize_email(None), None);
    }

    #[test]
    fn joined_one_handles_array_object_null_none() {
        let arr = json!([{"id": "ws-1"}]);
        let obj = json!({"id": "ws-2"});
        assert_eq!(joined_one(Some(&arr)), Some(&json!({"id": "ws-1"})));
        assert_eq!(joined_one(Some(&obj)), Some(&obj));
        assert_eq!(joined_one(Some(&Value::Null)), None);
        assert_eq!(joined_one(None), None);
        assert_eq!(joined_one(Some(&json!([]))), None);
    }

    #[test]
    fn build_workspace_member_shape() {
        let ws = json!({"id":"ws-1","name":"Acme","personal":false,
                        "avatar_url":null,"logo_url":null,"creator_id":"u1"});
        let s = build_workspace(&ws, "u1", "member", None).unwrap();
        assert_eq!(s["id"], "ws-1");
        assert_eq!(s["created_by_me"], true);
        assert_eq!(s["access_type"], "member");
        assert!(s.get("guest_board_count").is_none());
    }

    #[test]
    fn build_workspace_guest_shape() {
        let ws = json!({"id":"ws-2","name":null,"personal":true,
                        "avatar_url":null,"logo_url":null,"creator_id":"other"});
        let s = build_workspace(&ws, "u1", "guest", Some("edit")).unwrap();
        assert_eq!(s["name"], "Personal");
        assert_eq!(s["created_by_me"], false);
        assert_eq!(s["guest_board_count"], 1);
        assert_eq!(s["guest_highest_permission"], "edit");
        assert_eq!(s["guest_landing_path"], Value::Null);
        assert_eq!(s["guest_products"], json!(["tasks"]));
    }

    #[test]
    fn build_workspace_missing_id_returns_none() {
        assert!(build_workspace(&json!({"name": "No ID"}), "u", "member", None).is_none());
    }

    #[test]
    fn build_board_member_has_null_guest_permission() {
        let ws = json!({"id":"ws-1","name":"X","personal":false,
                        "avatar_url":null,"logo_url":null,"creator_id":"u"});
        let b = build_board(&json!({"id":"b1","ws_id":"ws-1"}), &ws, "u", "member", None).unwrap();
        assert_eq!(b["access_type"], "member");
        assert_eq!(b["guest_permission"], Value::Null);
    }

    #[test]
    fn build_board_guest_defaults_to_view_permission() {
        let ws = json!({"id":"ws-1","name":"X","personal":false,
                        "avatar_url":null,"logo_url":null,"creator_id":"o"});
        let b = build_board(&json!({"id":"b2","ws_id":"ws-1"}), &ws, "u", "guest", None).unwrap();
        assert_eq!(b["guest_permission"], "view");
    }

    #[test]
    fn build_board_missing_id_returns_none() {
        let ws = json!({"id":"ws-1","name":"X","personal":false,
                        "avatar_url":null,"logo_url":null,"creator_id":"u"});
        assert!(build_board(&json!({"ws_id":"ws-1"}), &ws, "u", "member", None).is_none());
    }
}
