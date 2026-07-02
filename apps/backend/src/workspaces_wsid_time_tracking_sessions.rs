//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/sessions`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/sessions/route.ts`.
//!
//! Supported `type` values: `running`, `paused`, `recent` (default), `history`,
//! `stats`. POST is **not** migrated; returns `None` so the worker falls through.
//!
//! Behavior gaps vs legacy:
//!
//! - `timeOfDay` / `projectContext` post-filters are not applied (TypeScript-only
//!   helpers with no SQL equivalent).
//! - `running` / `paused` task join is a simple `task:tasks(id,name)` embed
//!   rather than the workspace-bound two-step lookup in the legacy route.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PP: &str = "/api/v1/workspaces/";
const PS: &str = "/time-tracking/sessions";

const ROOT_WS: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL: &str = "internal";
const PERSONAL: &str = "personal";

#[derive(Deserialize)]
struct WsIdRow {
    id: Option<String>,
}
#[derive(Deserialize)]
struct CountRow {
    count: Option<i64>,
}
#[derive(Deserialize)]
struct IsPersonalRow {
    personal: Option<bool>,
}
#[derive(Serialize)]
struct StatsRpc<'a> {
    p_user_id: &'a str,
    p_ws_id: &'a str,
    p_is_personal: bool,
    p_timezone: &'a str,
    p_days_back: i64,
}
#[derive(Deserialize)]
struct StatsRow {
    today_time: f64,
    week_time: f64,
    month_time: f64,
    streak: f64,
}

pub(crate) async fn handle_workspaces_wsid_time_tracking_sessions_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = sessions_ws_id(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    let Some(token) = supabase_auth::request_access_token(request) else {
        return err(401, "Unauthorized");
    };
    let Some(uid) = supabase_auth::fetch_supabase_auth_user(cd, &token, outbound)
        .await
        .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err(401, "Unauthorized");
    };
    let ws_id = match normalize_ws(cd, outbound, raw_ws_id, &uid, &token).await {
        Ok(id) => id,
        Err(()) => return err(500, "Failed to verify workspace membership"),
    };
    match check_member(cd, outbound, &ws_id, &uid).await {
        Ok(true) => {}
        Ok(false) => return err(403, "Workspace access denied"),
        Err(()) => return err(500, "Failed to verify workspace membership"),
    }
    let url = match request.url.and_then(|u| url::Url::parse(u).ok()) {
        Some(u) => u,
        None => return err(400, "Invalid type parameter"),
    };
    let qp = |k: &str| -> Option<String> {
        url.query_pairs()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.into_owned())
    };
    let ty = qp("type").unwrap_or_else(|| "recent".to_owned());
    let quid = qp("userId").unwrap_or_else(|| uid.clone());
    let tz = qp("timezone").unwrap_or_else(|| "UTC".to_owned());
    if quid != uid {
        match check_member(cd, outbound, &ws_id, &quid).await {
            Ok(true) => {}
            Ok(false) => return err(404, "Target user not found in workspace"),
            Err(()) => return err(500, "Failed to verify workspace membership"),
        }
    }
    match ty.as_str() {
        "running" => running(cd, outbound, &ws_id, &quid).await,
        "paused" => paused(cd, outbound, &ws_id, &quid).await,
        "recent" | "history" => list(cd, outbound, &ws_id, &quid, &ty, &qp).await,
        "stats" => stats(cd, outbound, &ws_id, &quid, &tz).await,
        _ => err(400, "Invalid type parameter"),
    }
}

// ── type=running ──────────────────────────────────────────────────────────────

async fn running(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    ws_id: &str,
    uid: &str,
) -> BackendResponse {
    let sel = "*,category:time_tracking_categories(id,name,color),task:tasks(id,name)";
    let Some(url) = cd.rest_url(
        "time_tracking_sessions",
        &[
            ("select", sel.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{uid}")),
            ("is_running", "eq.true".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return err(500, "Internal server error");
    };
    match svc_get(cd, out, &url).await {
        Ok(r) if (200..300).contains(&r.status) => {
            let session = r
                .json::<Vec<Value>>()
                .ok()
                .and_then(|mut v| v.pop())
                .unwrap_or(Value::Null);
            no_store_response(json_response(200, json!({ "session": session })))
        }
        _ => err(500, "Internal server error"),
    }
}

// ── type=paused ───────────────────────────────────────────────────────────────

async fn paused(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    ws_id: &str,
    uid: &str,
) -> BackendResponse {
    let bsel = "session_id,break_start,break_type:workspace_break_types(*),\
                session:time_tracking_sessions!inner(ws_id)";
    let Some(burl) = cd.rest_url(
        "time_tracking_breaks",
        &[
            ("select", bsel.to_owned()),
            ("break_end", "is.null".to_owned()),
            ("created_by", format!("eq.{uid}")),
            ("session.ws_id", format!("eq.{ws_id}")),
            ("order", "break_start.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return err(500, "Internal server error");
    };
    let active: Option<Value> = match svc_get(cd, out, &burl).await {
        Ok(r) if (200..300).contains(&r.status) => {
            r.json::<Vec<Value>>().ok().and_then(|mut v| v.pop())
        }
        _ => return err(500, "Internal server error"),
    };
    let Some(brk) = active else {
        return no_store_response(json_response(200, json!({ "session": Value::Null })));
    };
    let Some(sid) = brk
        .get("session_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
    else {
        return no_store_response(json_response(200, json!({ "session": Value::Null })));
    };
    let pause_time = brk.get("break_start").cloned().unwrap_or(Value::Null);
    let break_type = brk.get("break_type").cloned().unwrap_or(Value::Null);
    let ssel = "*,category:time_tracking_categories(id,name,color),task:tasks(id,name)";
    let Some(surl) = cd.rest_url(
        "time_tracking_sessions",
        &[
            ("select", ssel.to_owned()),
            ("id", format!("eq.{sid}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{uid}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return err(500, "Internal server error");
    };
    match svc_get(cd, out, &surl).await {
        Ok(r) if (200..300).contains(&r.status) => {
            let session = r
                .json::<Vec<Value>>()
                .ok()
                .and_then(|mut v| v.pop())
                .unwrap_or(Value::Null);
            no_store_response(json_response(
                200,
                json!({ "session": session, "pauseTime": pause_time, "breakType": break_type }),
            ))
        }
        _ => err(500, "Internal server error"),
    }
}

// ── type=recent / history ─────────────────────────────────────────────────────

async fn list<F>(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    ws_id: &str,
    uid: &str,
    ty: &str,
    qp: &F,
) -> BackendResponse
where
    F: Fn(&str) -> Option<String>,
{
    let limit: usize = qp("limit")
        .and_then(|v| v.parse().ok())
        .map(|n: usize| n.min(50))
        .unwrap_or(10);
    let mut base: Vec<(&str, String)> = vec![
        ("ws_id", format!("eq.{ws_id}")),
        ("user_id", format!("eq.{uid}")),
        ("pending_approval", "eq.false".to_owned()),
    ];
    if ty == "recent" {
        base.push(("is_running", "eq.false".to_owned()));
    }
    if let Some(v) = qp("categoryId").filter(|v| v != "all") {
        base.push(("category_id", format!("eq.{v}")));
    }
    if let Some(v) = qp("taskId").filter(|v| v != "all") {
        base.push(("task_id", format!("eq.{v}")));
    }
    match qp("duration").as_deref() {
        Some("short") => base.push(("duration_seconds", "lt.1800".to_owned())),
        Some("medium") => {
            base.push(("duration_seconds", "gte.1800".to_owned()));
            base.push(("duration_seconds", "lt.7200".to_owned()));
        }
        Some("long") => base.push(("duration_seconds", "gte.7200".to_owned())),
        _ => {}
    }
    if let Some(v) = qp("dateFrom") {
        base.push(("start_time", format!("gte.{v}")));
    }
    if let Some(v) = qp("dateTo") {
        base.push(("start_time", format!("lte.{v}")));
    }
    if let Some(sq) = qp("searchQuery").filter(|v| !v.trim().is_empty()) {
        let e = esc_like(&sq);
        base.push(("or", format!("(title.ilike.%{e}%,description.ilike.%{e}%)")));
    }
    // Count query
    let mut cp: Vec<(&str, String)> = vec![("select", "count()".to_owned())];
    cp.extend_from_slice(&base);
    let Some(curl) = cd.rest_url("time_tracking_sessions", &cp) else {
        return err(500, "Internal server error");
    };
    let total: i64 = match svc_get(cd, out, &curl).await {
        Ok(r) if (200..300).contains(&r.status) => r
            .json::<Vec<CountRow>>()
            .ok()
            .and_then(|mut v| v.pop())
            .and_then(|r| r.count)
            .unwrap_or(0),
        _ => return err(500, "Internal server error"),
    };
    // Data query (add cursor then sort/limit)
    let mut dp: Vec<(&str, String)> = vec![(
        "select",
        "*,category:time_tracking_categories(*),task:tasks(*)".to_owned(),
    )];
    dp.extend_from_slice(&base);
    if let Some(cur) = qp("cursor") {
        let parts: Vec<&str> = cur.splitn(2, '|').collect();
        if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
            return err(400, "Invalid cursor format");
        }
        let st = esc_quote(parts[0]);
        let id = esc_quote(parts[1]);
        dp.push((
            "or",
            format!("(start_time.lt.\"{st}\",and(start_time.eq.\"{st}\",id.lt.\"{id}\"))"),
        ));
    }
    dp.push(("order", "start_time.desc,id.desc".to_owned()));
    dp.push(("limit", format!("{}", limit + 1)));
    let Some(durl) = cd.rest_url("time_tracking_sessions", &dp) else {
        return err(500, "Internal server error");
    };
    let mut sessions: Vec<Value> = match svc_get(cd, out, &durl).await {
        Ok(r) if (200..300).contains(&r.status) => r.json::<Vec<Value>>().unwrap_or_default(),
        _ => return err(500, "Internal server error"),
    };
    let has_more = sessions.len() > limit;
    if has_more {
        sessions.truncate(limit);
    }
    let next_cursor: Value = if has_more {
        sessions
            .last()
            .and_then(|s| {
                Some(Value::String(format!(
                    "{}|{}",
                    s.get("start_time")?.as_str()?,
                    s.get("id")?.as_str()?
                )))
            })
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    no_store_response(json_response(
        200,
        json!({ "sessions": sessions, "total": total, "hasMore": has_more, "nextCursor": next_cursor }),
    ))
}

// ── type=stats ────────────────────────────────────────────────────────────────

async fn stats(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    ws_id: &str,
    uid: &str,
    tz: &str,
) -> BackendResponse {
    let is_personal = {
        let Some(u) = cd.rest_url(
            "workspaces",
            &[
                ("select", "personal".to_owned()),
                ("id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        ) else {
            return err(500, "Internal server error");
        };
        match svc_get(cd, out, &u).await {
            Ok(r) if (200..300).contains(&r.status) => r
                .json::<Vec<IsPersonalRow>>()
                .ok()
                .and_then(|mut v| v.pop())
                .and_then(|r| r.personal)
                .unwrap_or(false),
            _ => return err(500, "Internal server error"),
        }
    };
    let Some(rpc) = cd.rpc_url("get_time_tracker_stats") else {
        return err(500, "Internal server error");
    };
    let Some(key) = cd.service_role_key() else {
        return err(500, "Internal server error");
    };
    let Ok(body) = serde_json::to_string(&StatsRpc {
        p_user_id: uid,
        p_ws_id: ws_id,
        p_is_personal: is_personal,
        p_timezone: tz,
        p_days_back: 0,
    }) else {
        return err(500, "Internal server error");
    };
    let bearer = format!("Bearer {key}");
    let Ok(r) = out
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
    else {
        return err(500, "Internal server error");
    };
    if !(200..300).contains(&r.status) {
        return err(500, "Internal server error");
    }
    match r.json::<Vec<StatsRow>>().ok().and_then(|mut v| v.pop()) {
        Some(s) => no_store_response(json_response(
            200,
            json!({ "stats": { "todayTime": s.today_time, "weekTime": s.week_time, "monthTime": s.month_time, "streak": s.streak } }),
        )),
        None => no_store_response(json_response(
            200,
            json!({ "stats": { "todayTime": 0, "weekTime": 0, "monthTime": 0, "streak": 0 } }),
        )),
    }
}

// ── Workspace resolution helpers ──────────────────────────────────────────────

async fn normalize_ws(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    raw: &str,
    uid: &str,
    token: &str,
) -> Result<String, ()> {
    let resolved = if raw.eq_ignore_ascii_case(INTERNAL) {
        ROOT_WS.to_owned()
    } else {
        raw.to_owned()
    };
    if resolved == ROOT_WS {
        return Ok(ROOT_WS.to_owned());
    }
    if raw.trim().eq_ignore_ascii_case(PERSONAL) {
        return personal_ws(cd, out, uid, token).await;
    }
    if !is_uuid(&resolved) {
        let h = raw.trim().to_lowercase();
        if is_direct_id(&h) {
            if let Some(id) = ws_by_handle(cd, out, &h, Some(token)).await? {
                return Ok(id);
            }
            if let Some(id) = ws_by_handle(cd, out, &h, None).await? {
                return Ok(id);
            }
        }
    }
    Ok(resolved)
}

async fn personal_ws(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    uid: &str,
    token: &str,
) -> Result<String, ()> {
    let url = cd
        .rest_url(
            "workspaces",
            &[
                (
                    "select",
                    "id,workspace_members!inner(user_id,type)".to_owned(),
                ),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{uid}")),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let r = caller_get(cd, out, &url, token).await?;
    if !(200..300).contains(&r.status) {
        return Err(());
    }
    r.json::<Vec<WsIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id)
        .ok_or(())
}

async fn ws_by_handle(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
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
    let r = if let Some(t) = token {
        caller_get(cd, out, &url, t).await?
    } else {
        svc_get(cd, out, &url).await?
    };
    if !(200..300).contains(&r.status) {
        return Ok(None);
    }
    Ok(r.json::<Vec<WsIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id))
}

async fn check_member(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    ws_id: &str,
    uid: &str,
) -> Result<bool, ()> {
    let url = cd
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{uid}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let r = svc_get(cd, out, &url).await?;
    if !(200..300).contains(&r.status) {
        return Err(());
    }
    Ok(!r.json::<Vec<Value>>().map_err(|_| ())?.is_empty())
}

fn is_uuid(v: &str) -> bool {
    v.trim().len() == 36
        && v.trim().chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_ws_handle(v: &str) -> bool {
    let l = v.len();
    l > 0
        && l <= 64
        && v.chars().enumerate().all(|(i, c)| {
            let e = i == 0 || i + 1 == l;
            c.is_ascii_lowercase() || c.is_ascii_digit() || (!e && matches!(c, '_' | '-'))
        })
}

fn is_direct_id(id: &str) -> bool {
    id == PERSONAL || id == ROOT_WS || id == INTERNAL || is_uuid(id) || is_ws_handle(id)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async fn svc_get(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let k = cd.service_role_key().ok_or(())?;
    let b = format!("Bearer {k}");
    out.send(
        OutboundRequest::new(OutboundMethod::Get, url)
            .with_header("Accept", APPLICATION_JSON)
            .with_header("Authorization", &b)
            .with_header("apikey", k),
    )
    .await
    .map_err(|_| ())
}

async fn caller_get(
    cd: &contact::ContactDataConfig,
    out: &impl OutboundHttpClient,
    url: &str,
    token: &str,
) -> Result<OutboundResponse, ()> {
    let k = cd.service_role_key().ok_or(())?;
    let b = format!("Bearer {token}");
    out.send(
        OutboundRequest::new(OutboundMethod::Get, url)
            .with_header("Accept", APPLICATION_JSON)
            .with_header("Authorization", &b)
            .with_header("apikey", k),
    )
    .await
    .map_err(|_| ())
}

fn sessions_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PP)?.strip_suffix(PS)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn esc_quote(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
fn esc_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}
fn err(status: u16, msg: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": msg })))
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches() {
        assert_eq!(
            sessions_ws_id("/api/v1/workspaces/ws-123/time-tracking/sessions"),
            Some("ws-123")
        );
    }

    #[test]
    fn path_guard_rejects_extra_segment() {
        assert!(sessions_ws_id("/api/v1/workspaces/ws-123/time-tracking/sessions/extra").is_none());
    }

    #[test]
    fn path_guard_rejects_wrong_suffix() {
        assert!(sessions_ws_id("/api/v1/workspaces/ws-123/time-tracking/templates").is_none());
    }

    #[test]
    fn path_guard_rejects_empty_ws_id() {
        assert!(sessions_ws_id("/api/v1/workspaces//time-tracking/sessions").is_none());
    }

    #[test]
    fn esc_like_metacharacters() {
        assert_eq!(esc_like("50% off_test\\path"), "50\\% off\\_test\\\\path");
    }

    #[test]
    fn esc_quote_backslash_and_quote() {
        assert_eq!(esc_quote(r#"a\b"c"#), r#"a\\b\"c"#);
    }

    #[test]
    fn is_uuid_valid() {
        assert!(is_uuid("00000000-0000-0000-0000-000000000000"));
    }

    #[test]
    fn is_uuid_rejects_short() {
        assert!(!is_uuid("abc"));
    }

    #[test]
    fn is_direct_id_recognizes_personal() {
        assert!(is_direct_id("personal"));
    }
}
