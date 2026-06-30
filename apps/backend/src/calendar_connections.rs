//! Handler for `GET /api/v1/calendar/connections`.
//!
//! Ports the legacy Next.js GET handler from
//! `apps/web/src/app/api/v1/calendar/connections/route.ts`.
//!
//! Auth: Supabase access token OR `calendar` app-session token. Returns:
//!
//! - `401 { "message": "Unauthorized" }` — unauthenticated.
//! - `400 { "error": "Missing workspace ID" }` — `wsId` absent.
//! - `403 { "error": "Forbidden" }` — not a workspace member.
//! - `500 { "error": "Failed to verify workspace access" }` — lookup error.
//! - `500 { "error": "Failed to fetch calendar connections" }` — read error.
//! - `200 { connections: [...] }` with `Cache-Control: private, max-age=60,
//!   stale-while-revalidate=30`.
//!
//! POST/PATCH/DELETE return `None` (fall through to Next.js).
//!
//! Gap: app-session callers use the service-role key for data access (RLS
//! bypassed but scoped by `ws_id` after explicit membership check), consistent
//! with other ported calendar handlers.

use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CONNECTIONS_PATH: &str = "/api/v1/calendar/connections";
const CONNECTIONS_CACHE_CONTROL: &str = "private, max-age=60, stale-while-revalidate=30";
const CALENDAR_APP_SESSION_TARGETS: [&str; 1] = ["calendar"];

const MISSING_WS_ID_MESSAGE: &str = "Missing workspace ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const CONNECTIONS_FAILED_MESSAGE: &str = "Failed to fetch calendar connections";

const INTERNAL_SLUG: &str = "internal";
const PERSONAL_SLUG: &str = "personal";
const ROOT_WS_ID: &str = "00000000-0000-0000-0000-000000000000";

#[derive(Clone, Debug, Eq, PartialEq)]
enum DataAuth {
    AccessToken(String),
    ServiceRole,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Caller {
    data_auth: DataAuth,
    id: String,
}

#[derive(serde::Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(serde::Deserialize)]
struct MemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_calendar_connections_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != CONNECTIONS_PATH {
        return None;
    }
    Some(match request.method {
        "GET" => get_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let caller = match resolve_caller(config, request, outbound).await {
        Ok(c) => c,
        Err(r) => return r,
    };
    let Some(raw_ws_id) = ws_id_from_url(request.url) else {
        return err(400, MISSING_WS_ID_MESSAGE);
    };
    let ws_id = match normalize_ws_id(&config.contact_data, outbound, &raw_ws_id, &caller).await {
        Ok(id) => id,
        Err(()) => return err(500, MEMBERSHIP_FAILED_MESSAGE),
    };
    match verify_member(&config.contact_data, outbound, &ws_id, &caller).await {
        Ok(true) => {}
        Ok(false) => return err(403, FORBIDDEN_MESSAGE),
        Err(()) => return err(500, MEMBERSHIP_FAILED_MESSAGE),
    }
    match fetch_connections(&config.contact_data, outbound, &ws_id, &caller).await {
        Ok(connections) => {
            let mut r = json_response(200, json!({ "connections": connections }));
            r.cache_control = Some(CONNECTIONS_CACHE_CONTROL);
            r
        }
        Err(()) => err(500, CONNECTIONS_FAILED_MESSAGE),
    }
}

async fn fetch_connections(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    caller: &Caller,
) -> Result<Vec<Value>, ()> {
    let url = cd
        .rest_url(
            "calendar_connections",
            &[
                ("select", "*".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = rest_get(cd, outbound, &url, &caller.data_auth).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<Value>>().map_err(|_| ())
}

async fn resolve_caller(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<Caller, BackendResponse> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &CALENDAR_APP_SESSION_TARGETS)
                .map_err(|_| msg(401, UNAUTHORIZED_MESSAGE))?;
        return Ok(Caller {
            data_auth: DataAuth::ServiceRole,
            id: identity.id,
        });
    }
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(msg(401, UNAUTHORIZED_MESSAGE));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return Err(msg(401, UNAUTHORIZED_MESSAGE));
    };
    Ok(Caller {
        data_auth: DataAuth::AccessToken(access_token),
        id: user_id,
    })
}

async fn normalize_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw: &str,
    caller: &Caller,
) -> Result<String, ()> {
    let resolved = if raw.eq_ignore_ascii_case(INTERNAL_SLUG) {
        ROOT_WS_ID.to_owned()
    } else {
        raw.to_owned()
    };

    if resolved == ROOT_WS_ID {
        return Ok(ROOT_WS_ID.to_owned());
    }
    if raw.trim().eq_ignore_ascii_case(PERSONAL_SLUG) {
        return personal_ws_id(cd, outbound, caller).await;
    }
    if !is_uuid_literal(&resolved) {
        let handle = raw.trim().to_lowercase();
        if is_direct_lookup_id(&handle) {
            if let Some(id) = ws_id_by_handle(cd, outbound, &handle, &caller.data_auth).await? {
                return Ok(id);
            }
            if let Some(id) = ws_id_by_handle(cd, outbound, &handle, &DataAuth::ServiceRole).await?
            {
                return Ok(id);
            }
        }
    }
    Ok(resolved)
}

async fn personal_ws_id(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    caller: &Caller,
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
                ("workspace_members.user_id", format!("eq.{}", caller.id)),
                ("workspace_members.type", "eq.MEMBER".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = rest_get(cd, outbound, &url, &caller.data_auth).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id)
        .ok_or(())
}

async fn ws_id_by_handle(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth,
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
    let resp = rest_get(cd, outbound, &url, auth).await?;
    if !(200..300).contains(&resp.status) {
        return Ok(None);
    }
    Ok(resp
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|r| r.id))
}

async fn verify_member(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    caller: &Caller,
) -> Result<bool, ()> {
    let url = cd
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{}", caller.id)),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = rest_get(cd, outbound, &url, &caller.data_auth).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    Ok(resp
        .json::<Vec<MemberRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|r| r.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn rest_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth,
) -> Result<OutboundResponse, ()> {
    let srk = cd.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(t) => format!("Bearer {t}"),
        DataAuth::ServiceRole => format!("Bearer {srk}"),
    };
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", srk),
        )
        .await
        .map_err(|_| ())
}

fn ws_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
    url.query_pairs()
        .find_map(|(k, v)| (k == "wsId" && !v.trim().is_empty()).then(|| v.into_owned()))
}

fn is_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value.trim().chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let n = value.len();
    if n == 0 || n > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| {
        let edge = i == 0 || i + 1 == n;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!edge && matches!(c, '_' | '-'))
    })
}

fn is_direct_lookup_id(id: &str) -> bool {
    id == PERSONAL_SLUG
        || id == ROOT_WS_ID
        || id == INTERNAL_SLUG
        || is_uuid_literal(id)
        || is_workspace_handle(id)
}

fn err(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn msg(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_id_absent_returns_none() {
        assert_eq!(
            ws_id_from_url(Some("https://example.com/api/v1/calendar/connections")),
            None
        );
    }

    #[test]
    fn ws_id_empty_returns_none() {
        assert_eq!(
            ws_id_from_url(Some(
                "https://example.com/api/v1/calendar/connections?wsId="
            )),
            None
        );
    }

    #[test]
    fn ws_id_present_returns_value() {
        let id = "11111111-1111-1111-1111-111111111111";
        assert_eq!(
            ws_id_from_url(Some(&format!(
                "https://example.com/api/v1/calendar/connections?wsId={id}"
            ))),
            Some(id.to_owned())
        );
    }

    #[test]
    fn uuid_literal_valid() {
        assert!(is_uuid_literal("aaaabbbb-cccc-dddd-eeee-ffffffffffff"));
    }

    #[test]
    fn uuid_literal_rejects_short() {
        assert!(!is_uuid_literal("short"));
    }

    #[test]
    fn handle_valid() {
        assert!(is_workspace_handle("my-ws"));
        assert!(is_workspace_handle("abc123"));
    }

    #[test]
    fn handle_rejects_leading_dash() {
        assert!(!is_workspace_handle("-bad"));
    }

    #[test]
    fn handle_rejects_empty() {
        assert!(!is_workspace_handle(""));
    }

    #[test]
    fn path_constant() {
        assert_eq!(CONNECTIONS_PATH, "/api/v1/calendar/connections");
    }

    #[test]
    fn cache_control_constant() {
        assert_eq!(
            CONNECTIONS_CACHE_CONTROL,
            "private, max-age=60, stale-while-revalidate=30"
        );
    }
}
