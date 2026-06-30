//! Handler for `GET /api/v1/workspaces/:wsId/task-boards`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/task-boards/route.ts` (GET
//! only; POST is left to the still-live Next.js route — returns `None`).
//!
//! Auth model:
//!
//! - `withSessionAuth` with `allowAppSessionAuth: { targetApp: [cli, calendar,
//!   tasks] }` — regular Supabase JWTs and those three app-session token
//!   types are accepted.
//! - Members require the `manage_projects` workspace permission (checked via
//!   the `has_workspace_permission` Postgres RPC).
//! - Non-members fall back to guest board-share access (`task_board_shares`).
//! - Boards are enriched with `list_count` and `task_count`.
//!
//! BEHAVIOR GAPS:
//!
//! - `ensureDefaultPersonalTaskBoard` is skipped (no mutation in GET).
//! - `guest_highest_permission` ordering assumes `view < comment < edit <
//!   manage`; exact `summarizeTaskBoardGuestShares` ordering not reproduced.
//! - Handle-slug workspace resolution retries with service-role key; the
//!   legacy `normalizeWorkspaceId` uses an RLS client on the first attempt.

use std::collections::{BTreeSet, HashMap};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/task-boards";
const ROOT_WS_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_SLUG: &str = "personal";
const INTERNAL_SLUG: &str = "internal";
const MANAGE_PROJECTS: &str = "manage_projects";
const HAS_WS_PERMISSION_RPC: &str = "has_workspace_permission";
const BATCH_SIZE: usize = 500;
const APP_SESSION_TARGETS: &[&str] = &["calendar", "tasks"];
const PERM_ORDER: &[&str] = &["view", "comment", "edit", "manage"];

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WsIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MemberRow {
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[derive(Deserialize)]
struct PrivateEmailRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct ShareRow {
    board_id: Option<String>,
    permission: Option<String>,
}

#[derive(Deserialize)]
struct ListRow {
    id: Option<String>,
    board_id: Option<String>,
}

#[derive(Deserialize)]
struct TaskRow {
    list_id: Option<String>,
}

#[derive(Serialize)]
struct HasWsPermRpc<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_task_boards_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = task_boards_ws_id(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Internal server error");
    }

    let query = match parse_query(request.url) {
        Ok(q) => q,
        Err(()) => return err(400, "Invalid request parameters"),
    };

    // Authenticate — prefer app-session identity, fall back to Supabase JWT.
    let (user_id, auth_email, token) = match resolve_user(config, request, outbound).await {
        Some(u) => u,
        None => return err(401, "Unauthorized"),
    };

    let ws_id = match normalize_ws(cd, outbound, raw_ws_id, &user_id, token.as_deref()).await {
        Ok(Some(id)) => id,
        Ok(None) | Err(()) => return err(500, "Internal server error"),
    };

    let is_member = match membership(cd, outbound, &ws_id, &user_id, token.as_deref()).await {
        Ok(Some(t)) => t == "MEMBER",
        Ok(None) => false,
        Err(()) => return err(500, "Failed to verify workspace access"),
    };

    let guest_shares: Vec<ShareRow>;
    if is_member {
        match check_permission(cd, outbound, &ws_id, &user_id).await {
            Ok(true) => {}
            Ok(false) => {
                return err(403, "You don't have permission to view task boards");
            }
            Err(()) => return err(500, "Internal server error"),
        }
        guest_shares = Vec::new();
    } else {
        guest_shares =
            match load_shares(cd, outbound, &ws_id, &user_id, auth_email.as_deref()).await {
                Ok(s) => s,
                Err(()) => return err(500, "Internal server error"),
            };
        if guest_shares.is_empty() {
            return err(403, "Workspace access denied");
        }
    }

    let guest_ids: Option<Vec<&str>> = if is_member {
        None
    } else {
        Some(
            guest_shares
                .iter()
                .filter_map(|s| s.board_id.as_deref())
                .collect(),
        )
    };

    let (boards_raw, total_count) =
        match fetch_boards(cd, outbound, &ws_id, &query, guest_ids.as_deref()).await {
            Ok(r) => r,
            Err(()) => return err(500, "Failed to fetch workspace boards"),
        };

    let access_type = if is_member { "member" } else { "guest" };
    let guest_highest = if is_member {
        Value::Null
    } else {
        Value::String(highest_perm(&guest_shares).to_owned())
    };

    if boards_raw.is_empty() {
        return no_store_response(json_response(
            200,
            json!({
                "boards": [],
                "count": total_count,
                "access_type": access_type,
                "guest_highest_permission": guest_highest,
            }),
        ));
    }

    let board_ids: Vec<String> = boards_raw
        .iter()
        .filter_map(|b| b.get("id")?.as_str().map(str::to_owned))
        .collect();

    let task_lists = match fetch_lists(cd, outbound, &board_ids).await {
        Ok(l) => l,
        Err(()) => return err(500, "Failed to fetch task board list counts"),
    };

    let list_ids: Vec<String> = task_lists
        .iter()
        .filter_map(|l| l.id.as_deref().map(str::to_owned))
        .collect();

    let task_cnt_by_list = if list_ids.is_empty() {
        HashMap::new()
    } else {
        match fetch_task_counts(cd, outbound, &list_ids).await {
            Ok(c) => c,
            Err(()) => return err(500, "Failed to fetch task board task counts"),
        }
    };

    let mut list_cnt: HashMap<String, u64> = HashMap::new();
    let mut task_cnt: HashMap<String, u64> = HashMap::new();
    for list in &task_lists {
        let (Some(bid), Some(lid)) = (list.board_id.as_deref(), list.id.as_deref()) else {
            continue;
        };
        *list_cnt.entry(bid.to_owned()).or_insert(0) += 1;
        *task_cnt.entry(bid.to_owned()).or_insert(0) +=
            task_cnt_by_list.get(lid).copied().unwrap_or(0);
    }

    let guest_perm_map: HashMap<String, String> = guest_shares
        .iter()
        .filter_map(|s| {
            Some((
                s.board_id.clone()?,
                s.permission.clone().unwrap_or_else(|| "view".to_owned()),
            ))
        })
        .collect();

    let boards: Vec<Value> = boards_raw
        .into_iter()
        .map(|mut b| {
            let bid = b.get("id").and_then(Value::as_str).unwrap_or_default();
            let lc = list_cnt.get(bid).copied().unwrap_or(0);
            let tc = task_cnt.get(bid).copied().unwrap_or(0);
            let gp = if is_member {
                Value::Null
            } else {
                Value::String(
                    guest_perm_map
                        .get(bid)
                        .cloned()
                        .unwrap_or_else(|| "view".to_owned()),
                )
            };
            if let Some(obj) = b.as_object_mut() {
                obj.insert("list_count".to_owned(), json!(lc));
                obj.insert("task_count".to_owned(), json!(tc));
                obj.insert("access_type".to_owned(), json!(access_type));
                obj.insert("guest_permission".to_owned(), gp);
            }
            b
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "boards": boards,
            "count": total_count,
            "access_type": access_type,
            "guest_highest_permission": guest_highest,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/// Returns `(user_id, auth_email, access_token)`.
async fn resolve_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(String, Option<String>, Option<String>)> {
    if contact::request_has_app_session_token(request) {
        if let Ok(id) = contact::resolve_app_session_identity(config, request, APP_SESSION_TARGETS)
        {
            let uid = non_empty(id.id)?;
            return Some((uid, id.email, None));
        }
        if let Ok(id) = contact::resolve_cli_app_session_identity(config, request) {
            let uid = non_empty(id.id)?;
            return Some((uid, id.email, None));
        }
        return None;
    }
    let tok = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &tok, outbound).await?;
    let uid = non_empty(user.id?)?;
    Some((uid, user.email, Some(tok)))
}

fn non_empty(s: String) -> Option<String> {
    if s.trim().is_empty() { None } else { Some(s) }
}

// ---------------------------------------------------------------------------
// Workspace ID normalization
// ---------------------------------------------------------------------------

async fn normalize_ws(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw: &str,
    user_id: &str,
    token: Option<&str>,
) -> Result<Option<String>, ()> {
    if raw.trim().eq_ignore_ascii_case(INTERNAL_SLUG) {
        return Ok(Some(ROOT_WS_ID.to_owned()));
    }
    if raw.trim().eq_ignore_ascii_case(PERSONAL_SLUG) {
        return personal_ws_id(cd, outbound, user_id, token).await;
    }
    let resolved = raw.to_owned();
    if !is_ws_uuid(&resolved) {
        let handle = raw.trim().to_lowercase();
        // Try caller token first, then service-role fallback.
        if let Some(id) = ws_id_by_handle(cd, outbound, &handle, token).await? {
            return Ok(Some(id));
        }
        if token.is_some()
            && let Some(id) = ws_id_by_handle(cd, outbound, &handle, None).await?
        {
            return Ok(Some(id));
        }
    }
    Ok(Some(resolved))
}

async fn personal_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = cd
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "id,workspace_members!inner(user_id,type)".to_owned(),
                ),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get(cd, outbound, &url, token).await?;
    if !(200..300).contains(&resp.status) {
        return Ok(None);
    }
    Ok(resp
        .json::<Vec<WsIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id))
}

async fn ws_id_by_handle(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = cd
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get(cd, outbound, &url, token).await?;
    if !(200..300).contains(&resp.status) {
        return Ok(None);
    }
    Ok(resp
        .json::<Vec<WsIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id))
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

async fn membership(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = cd
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = get(cd, outbound, &url, token).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<MemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.kind))
}

// ---------------------------------------------------------------------------
// Permission check via Postgres RPC
// ---------------------------------------------------------------------------

async fn check_permission(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let srk = cd.service_role_key().ok_or(())?;
    let url = cd.rpc_url(HAS_WS_PERMISSION_RPC).ok_or(())?;
    let body = serde_json::to_string(&HasWsPermRpc {
        p_permission: MANAGE_PROJECTS,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {srk}"))
                .with_header("apikey", srk)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<bool>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Guest shares
// ---------------------------------------------------------------------------

async fn load_shares(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    auth_email: Option<&str>,
) -> Result<Vec<ShareRow>, ()> {
    let email = match norm_email(auth_email) {
        Some(e) => Some(e),
        None => user_private_email(cd, outbound, user_id).await?,
    };

    let mut seen = BTreeSet::<String>::new();
    let mut by_board: HashMap<String, ShareRow> = HashMap::new();

    for s in query_shares(cd, outbound, ws_id, "shared_with_user_id", user_id).await? {
        if let Some(bid) = s.board_id.clone()
            && seen.insert(bid.clone())
        {
            by_board.insert(bid, s);
        }
    }
    if let Some(e) = &email {
        for s in query_shares(cd, outbound, ws_id, "shared_with_email", e).await? {
            if let Some(bid) = s.board_id.clone()
                && seen.insert(bid.clone())
            {
                by_board.insert(bid, s);
            }
        }
    }

    Ok(seen
        .into_iter()
        .filter_map(|bid| by_board.remove(&bid))
        .collect())
}

async fn query_shares(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    col: &str,
    val: &str,
) -> Result<Vec<ShareRow>, ()> {
    let url = cd
        .rest_url(
            "task_board_shares",
            &[
                (
                    "select",
                    "board_id,permission,workspace_boards!inner(id,ws_id,deleted_at)".to_owned(),
                ),
                ("workspace_boards.ws_id", format!("eq.{ws_id}")),
                ("workspace_boards.deleted_at", "is.null".to_owned()),
                (col, format!("eq.{val}")),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Ok(Vec::new());
    }
    resp.json::<Vec<ShareRow>>().map_err(|_| ())
}

async fn user_private_email(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let url = cd
        .rest_url(
            "user_private_details",
            &[
                ("select", "email".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Ok(None);
    }
    Ok(resp
        .json::<Vec<PrivateEmailRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.email)
        .and_then(|e| norm_email(Some(&e))))
}

fn norm_email(e: Option<&str>) -> Option<String> {
    let n = e?.trim().to_lowercase();
    (!n.is_empty()).then_some(n)
}

fn highest_perm(shares: &[ShareRow]) -> &str {
    shares
        .iter()
        .filter_map(|s| s.permission.as_deref())
        .max_by_key(|p| PERM_ORDER.iter().position(|&o| o == *p).unwrap_or(0))
        .unwrap_or("view")
}

// ---------------------------------------------------------------------------
// Board fetch
// ---------------------------------------------------------------------------

struct BoardsQuery {
    q: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
    status: BoardStatus,
}

enum BoardStatus {
    Active,
    Archived,
    Deleted,
    All,
}

fn parse_query(url: Option<&str>) -> Result<BoardsQuery, ()> {
    let url_str = url.unwrap_or("http://localhost/");
    let parsed = url::Url::parse(url_str)
        .unwrap_or_else(|_| url::Url::parse("http://localhost/").expect("fallback"));
    let pairs: HashMap<String, String> = parsed
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    let q = pairs
        .get("q")
        .map(|v| v.trim().to_owned())
        .filter(|v| !v.is_empty() && v.len() <= 100);
    let page = pairs
        .get("page")
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&n| n >= 1);
    let page_size = pairs
        .get("pageSize")
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&n| (1..=200).contains(&n));
    let status = match pairs.get("status").map(String::as_str) {
        Some("archived") => BoardStatus::Archived,
        Some("deleted") => BoardStatus::Deleted,
        Some("all") => BoardStatus::All,
        Some("active") | None => BoardStatus::Active,
        Some(_) => return Err(()),
    };

    Ok(BoardsQuery {
        q,
        page,
        page_size,
        status,
    })
}

async fn fetch_boards(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &BoardsQuery,
    guest_ids: Option<&[&str]>,
) -> Result<(Vec<Value>, i64), ()> {
    let mut params: Vec<(&str, String)> = vec![
        ("select", "*".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "name.asc,created_at.desc".to_owned()),
    ];
    match query.status {
        BoardStatus::Active => {
            params.push(("archived_at", "is.null".to_owned()));
            params.push(("deleted_at", "is.null".to_owned()));
        }
        BoardStatus::Archived => {
            params.push(("archived_at", "not.is.null".to_owned()));
            params.push(("deleted_at", "is.null".to_owned()));
        }
        BoardStatus::Deleted => params.push(("deleted_at", "not.is.null".to_owned())),
        BoardStatus::All => {}
    }
    if let Some(q) = &query.q {
        params.push(("name", format!("ilike.*{q}*")));
    }
    if let Some(ids) = guest_ids {
        params.push(("id", format!("in.({})", ids.join(","))));
    }
    if let (Some(page), Some(ps)) = (query.page, query.page_size) {
        params.push(("offset", ((page - 1) * ps).to_string()));
        params.push(("limit", ps.to_string()));
    }

    let url = cd.rest_url("workspace_boards", &params).ok_or(())?;
    let srk = cd.service_role_key().ok_or(())?;
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &format!("Bearer {srk}"))
                .with_header("apikey", srk)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    let count = content_range_total(resp.header("content-range")).unwrap_or(0);
    let boards = resp.json::<Vec<Value>>().map_err(|_| ())?;
    Ok((boards, count))
}

// ---------------------------------------------------------------------------
// Task list + task count fetch
// ---------------------------------------------------------------------------

async fn fetch_lists(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    board_ids: &[String],
) -> Result<Vec<ListRow>, ()> {
    let mut out = Vec::new();
    for chunk in board_ids.chunks(BATCH_SIZE) {
        let url = cd
            .rest_url(
                "task_lists",
                &[
                    ("select", "id,board_id".to_owned()),
                    ("board_id", format!("in.({})", chunk.join(","))),
                    ("deleted", "eq.false".to_owned()),
                ],
            )
            .ok_or(())?;
        let resp = svc_get(cd, outbound, &url).await?;
        if !(200..300).contains(&resp.status) {
            return Err(());
        }
        out.extend(resp.json::<Vec<ListRow>>().map_err(|_| ())?);
    }
    Ok(out)
}

async fn fetch_task_counts(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    list_ids: &[String],
) -> Result<HashMap<String, u64>, ()> {
    let mut counts: HashMap<String, u64> = HashMap::new();
    for chunk in list_ids.chunks(BATCH_SIZE) {
        let url = cd
            .rest_url(
                "tasks",
                &[
                    ("select", "list_id".to_owned()),
                    ("list_id", format!("in.({})", chunk.join(","))),
                    ("deleted_at", "is.null".to_owned()),
                ],
            )
            .ok_or(())?;
        let resp = svc_get(cd, outbound, &url).await?;
        if !(200..300).contains(&resp.status) {
            return Err(());
        }
        for t in resp.json::<Vec<TaskRow>>().map_err(|_| ())? {
            if let Some(lid) = t.list_id {
                *counts.entry(lid).or_insert(0) += 1;
            }
        }
    }
    Ok(counts)
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn svc_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    get(cd, outbound, url, None).await
}

async fn get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    token: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let srk = cd.service_role_key().ok_or(())?;
    let auth = match token {
        Some(t) => format!("Bearer {t}"),
        None => format!("Bearer {srk}"),
    };
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())
}

fn content_range_total(header: Option<&str>) -> Option<i64> {
    let total = header?.split('/').nth(1)?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Path extraction + workspace UUID check
// ---------------------------------------------------------------------------

fn task_boards_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn is_ws_uuid(v: &str) -> bool {
    let v = v.trim();
    v.len() == 36
        && v.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches() {
        let ws = "11111111-1111-4111-8111-111111111111";
        assert_eq!(
            task_boards_ws_id(&format!("/api/v1/workspaces/{ws}/task-boards")),
            Some(ws)
        );
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        assert!(task_boards_ws_id("/api/v1/workspaces/some-id/boards").is_none());
    }

    #[test]
    fn path_guard_rejects_nested_segments() {
        // Panicking `.then_some(segments[i])` must not be used.
        assert!(task_boards_ws_id("/api/v1/workspaces/a/b/task-boards").is_none());
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert!(task_boards_ws_id("/api/v1/workspaces//task-boards").is_none());
    }

    #[test]
    fn content_range_parses() {
        assert_eq!(content_range_total(Some("0-49/256")), Some(256));
        assert_eq!(content_range_total(Some("*/0")), Some(0));
        assert_eq!(content_range_total(Some("0-0/*")), None);
        assert_eq!(content_range_total(None), None);
    }

    #[test]
    fn highest_perm_returns_highest_known() {
        let shares = vec![
            ShareRow {
                board_id: Some("b1".into()),
                permission: Some("view".into()),
            },
            ShareRow {
                board_id: Some("b2".into()),
                permission: Some("edit".into()),
            },
            ShareRow {
                board_id: Some("b3".into()),
                permission: Some("comment".into()),
            },
        ];
        assert_eq!(highest_perm(&shares), "edit");
    }

    #[test]
    fn highest_perm_defaults_when_all_none() {
        let shares = vec![ShareRow {
            board_id: Some("b1".into()),
            permission: None,
        }];
        assert_eq!(highest_perm(&shares), "view");
    }

    #[test]
    fn parse_query_defaults_active() {
        let q = parse_query(Some("http://localhost/")).expect("parse ok");
        assert!(matches!(q.status, BoardStatus::Active));
        assert!(q.q.is_none());
    }

    #[test]
    fn parse_query_archived_status() {
        let q = parse_query(Some("http://localhost/?status=archived")).expect("parse ok");
        assert!(matches!(q.status, BoardStatus::Archived));
    }

    #[test]
    fn parse_query_rejects_unknown_status() {
        assert!(parse_query(Some("http://localhost/?status=bogus")).is_err());
    }

    #[test]
    fn is_ws_uuid_accepts_valid() {
        assert!(is_ws_uuid("11111111-1111-4111-8111-111111111111"));
    }

    #[test]
    fn is_ws_uuid_rejects_short() {
        assert!(!is_ws_uuid("short"));
    }
}
