//! Handler for `GET /api/v1/workspaces/:wsId/calendar/sync-preferences`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/calendar/sync-preferences/route.ts`
//! (GET only; PATCH stays live in Next.js — returns `None` for non-GET).
//!
//! Legacy GET auth:
//!
//!   - `resolveSessionAuthContext` with `allowAppSessionAuth: { targetApp: 'calendar' }`.
//!   - `verifyWorkspaceMembershipType` with default `requiredType: 'MEMBER'`.
//!
//! Data:
//!
//!   - `private.workspace_calendars` (enabled) via service-role + `Accept-Profile: private`.
//!   - `calendar_auth_tokens` (active, user-scoped, google/microsoft) via service-role.
//!   - `calendar_connections` (enabled, auth_token_id IN token ids) via service-role.
//!   - `private.calendar_user_workspace_preferences` via service-role + `Accept-Profile: private`.
//!
//! Behavior gaps:
//!
//!   - `wsId` slug normalization ("personal" → UUID) is not reproduced; raw
//!     path segment forwarded unchanged.
//!   - Calendar app-session token (`ttr_app_*`) auth is not reproduced; those
//!     callers fall through to the still-live Next.js route.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    path_segments, supabase_auth,
};

const DEFAULT_INBOUND: bool = true;
const DEFAULT_OUTBOUND: bool = false;
const DEFAULT_POLICY: &str = "latest_write_wins";

#[derive(Deserialize)]
struct MemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WsCalRow {
    id: Option<String>,
    name: Option<String>,
    color: Option<Value>,
    calendar_type: Option<String>,
}

#[derive(Deserialize)]
struct TokenRow {
    id: Option<String>,
    provider: Option<String>,
    account_email: Option<Value>,
    account_name: Option<Value>,
}

#[derive(Deserialize)]
struct ConnRow {
    id: Option<String>,
    provider: Option<String>,
    auth_token_id: Option<String>,
    calendar_id: Option<String>,
    calendar_name: Option<String>,
    color: Option<Value>,
    workspace_calendar_id: Option<Value>,
    access_role: Option<Value>,
}

#[derive(Deserialize)]
struct PrefRow {
    inbound_sync_enabled: Option<bool>,
    outbound_sync_enabled: Option<bool>,
    conflict_policy: Option<String>,
    default_outbound_calendar_connection_id: Option<String>,
}

#[derive(Deserialize)]
struct PgRestError {
    code: Option<String>,
    message: Option<String>,
}

enum PrefErr {
    SchemaMissing,
    Internal,
}

pub(crate) async fn handle_workspaces_wsid_calendar_sync_preferences_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let ws_id = sync_prefs_ws_id(request.path)?;
    Some(match request.method {
        "GET" => get_response(config, request, ws_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let cd = &config.contact_data;
    if !cd.configured() {
        return err(500, "Failed to load calendar sync preferences");
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return err(401, "Unauthorized");
    };
    let Some(user_id) = supabase_auth::fetch_supabase_auth_user(cd, &access_token, outbound)
        .await
        .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return err(401, "Unauthorized");
    };

    match verify_member(cd, outbound, ws_id, &user_id, &access_token).await {
        Ok(true) => {}
        Ok(false) => return err(403, "Workspace access denied"),
        Err(()) => return err(500, "Failed to verify workspace membership"),
    }

    let calendars = match fetch_ws_cals(cd, outbound, ws_id).await {
        Ok(r) => r,
        Err(()) => return err(500, "Failed to load calendar sync preferences"),
    };
    let tokens = match fetch_tokens(cd, outbound, ws_id, &user_id).await {
        Ok(r) => r,
        Err(()) => return err(500, "Failed to load calendar sync preferences"),
    };
    let token_ids: Vec<String> = tokens.iter().filter_map(|t| t.id.clone()).collect();
    let conns = if token_ids.is_empty() {
        vec![]
    } else {
        match fetch_conns(cd, outbound, ws_id, &token_ids).await {
            Ok(r) => r,
            Err(()) => return err(500, "Failed to load calendar sync preferences"),
        }
    };
    let options = build_options(&calendars, &tokens, &conns);

    let pref = match fetch_prefs(cd, outbound, ws_id, &user_id).await {
        Ok(row) => row,
        Err(PrefErr::SchemaMissing) => {
            return no_store_response(json_response(
                200,
                json!({
                    "inboundSyncEnabled": DEFAULT_INBOUND,
                    "outboundSyncEnabled": DEFAULT_OUTBOUND,
                    "conflictPolicy": DEFAULT_POLICY,
                    "defaultOutboundConnectionId": null,
                    "options": options,
                    "settingsAvailable": false,
                }),
            ));
        }
        Err(PrefErr::Internal) => return err(500, "Failed to load calendar sync preferences"),
    };

    let inbound = pref
        .as_ref()
        .and_then(|r| r.inbound_sync_enabled)
        .unwrap_or(DEFAULT_INBOUND);
    let out_en = pref
        .as_ref()
        .and_then(|r| r.outbound_sync_enabled)
        .unwrap_or(DEFAULT_OUTBOUND);
    let policy = pref
        .as_ref()
        .and_then(|r| r.conflict_policy.as_deref())
        .filter(|&p| p == DEFAULT_POLICY)
        .unwrap_or(DEFAULT_POLICY)
        .to_owned();
    let def_out: Value = pref
        .and_then(|r| r.default_outbound_calendar_connection_id)
        .map(Value::String)
        .unwrap_or(Value::Null);

    no_store_response(json_response(
        200,
        json!({
            "inboundSyncEnabled": inbound,
            "outboundSyncEnabled": out_en,
            "conflictPolicy": policy,
            "defaultOutboundConnectionId": def_out,
            "options": options,
            "settingsAvailable": true,
        }),
    ))
}

async fn verify_member(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<bool, ()> {
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
    let sk = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {access_token}");
    let resp = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", sk),
        )
        .await
        .map_err(|_| ())?;
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

async fn fetch_ws_cals(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<WsCalRow>, ()> {
    let url = cd
        .rest_url(
            "workspace_calendars",
            &[
                ("select", "id,name,color,calendar_type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("is_enabled", "eq.true".to_owned()),
                ("order", "is_system.desc,position.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get_private(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<WsCalRow>>().map_err(|_| ())
}

async fn fetch_tokens(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<TokenRow>, ()> {
    let url = cd
        .rest_url(
            "calendar_auth_tokens",
            &[
                (
                    "select",
                    "id,provider,account_email,account_name".to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("is_active", "eq.true".to_owned()),
                ("provider", "in.(google,microsoft)".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<TokenRow>>().map_err(|_| ())
}

async fn fetch_conns(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    token_ids: &[String],
) -> Result<Vec<ConnRow>, ()> {
    let in_filter = format!("in.({})", token_ids.join(","));
    let url = cd
        .rest_url(
            "calendar_connections",
            &[
                (
                    "select",
                    "id,provider,auth_token_id,calendar_id,calendar_name,color,workspace_calendar_id,access_role"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("is_enabled", "eq.true".to_owned()),
                ("auth_token_id", in_filter),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let resp = svc_get(cd, outbound, &url).await?;
    if !(200..300).contains(&resp.status) {
        return Err(());
    }
    resp.json::<Vec<ConnRow>>().map_err(|_| ())
}

fn build_options(cals: &[WsCalRow], tokens: &[TokenRow], conns: &[ConnRow]) -> Vec<Value> {
    let mut opts: Vec<Value> = cals
        .iter()
        .filter_map(|c| {
            let id = c.id.as_deref()?;
            let ct = c.calendar_type.as_deref().unwrap_or("");
            let label = if ct == "primary" {
                "Tuturuuu Primary".to_owned()
            } else {
                c.name.clone().unwrap_or_default()
            };
            Some(json!({
                "id": format!("tuturuuu:{id}"),
                "provider": "tuturuuu",
                "workspaceCalendarId": id,
                "label": label,
                "color": c.color,
                "primary": ct == "primary",
                "writable": true,
            }))
        })
        .collect();

    for conn in conns {
        let Some(conn_id) = conn.id.as_deref() else {
            continue;
        };
        let Some(provider) = conn.provider.as_deref() else {
            continue;
        };
        let Some(token) = tokens.iter().find(|t| {
            t.id.as_deref() == conn.auth_token_id.as_deref()
                && t.provider.as_deref() == Some(provider)
        }) else {
            continue;
        };
        opts.push(json!({
            "id": format!("{provider}:{conn_id}"),
            "provider": provider,
            "connectionId": conn_id,
            "workspaceCalendarId": conn.workspace_calendar_id,
            "externalCalendarId": conn.calendar_id,
            "accessRole": conn.access_role,
            "accountEmail": token.account_email,
            "accountName": token.account_name,
            "label": conn.calendar_name,
            "color": conn.color,
            "writable": true,
        }));
    }
    opts
}

async fn fetch_prefs(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<PrefRow>, PrefErr> {
    let url = cd
        .rest_url(
            "calendar_user_workspace_preferences",
            &[
                (
                    "select",
                    "inbound_sync_enabled,outbound_sync_enabled,conflict_policy,default_outbound_calendar_connection_id"
                        .to_owned(),
                ),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(PrefErr::Internal)?;
    let resp = svc_get_private(cd, outbound, &url)
        .await
        .map_err(|()| PrefErr::Internal)?;
    if !(200..300).contains(&resp.status) {
        return Err(if schema_missing(&resp.body_text) {
            PrefErr::SchemaMissing
        } else {
            PrefErr::Internal
        });
    }
    resp.json::<Vec<PrefRow>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| PrefErr::Internal)
}

/// Mirrors `isMissingCalendarSyncSchemaError` in sync-preferences.ts.
fn schema_missing(body: &str) -> bool {
    let Ok(e) = serde_json::from_str::<PgRestError>(body) else {
        return false;
    };
    if let Some(c) = &e.code
        && (c == "42703" || c == "PGRST204" || c == "CALENDAR_SYNC_SCHEMA_MISSING")
    {
        return true;
    }
    e.message.as_deref().is_some_and(|m| {
        let m = m.to_lowercase();
        m.contains("inbound_sync_enabled")
            || m.contains("outbound_sync_enabled")
            || m.contains("conflict_policy")
            || m.contains("default_outbound_calendar_connection_id")
            || m.contains("sync_outbound_enabled")
    })
}

async fn svc_get_private(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let sk = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {sk}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", "private")
                .with_header("Authorization", &auth)
                .with_header("apikey", sk),
        )
        .await
        .map_err(|_| ())
}

async fn svc_get(
    cd: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let sk = cd.service_role_key().ok_or(())?;
    let auth = format!("Bearer {sk}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &auth)
                .with_header("apikey", sk),
        )
        .await
        .map_err(|_| ())
}

fn sync_prefs_ws_id(path: &str) -> Option<&str> {
    match path_segments(path).as_slice() {
        [
            "api",
            "v1",
            "workspaces",
            ws_id,
            "calendar",
            "sync-preferences",
        ] if !ws_id.is_empty() => Some(ws_id),
        _ => None,
    }
}

fn err(status: u16, msg: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": msg })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

    // --- path guard ---

    #[test]
    fn path_guard_matches_and_rejects() {
        // Exact mount path.
        assert_eq!(
            sync_prefs_ws_id(&format!(
                "/api/v1/workspaces/{WS}/calendar/sync-preferences"
            )),
            Some(WS)
        );
        // Slug workspace id.
        assert_eq!(
            sync_prefs_ws_id("/api/v1/workspaces/my-ws/calendar/sync-preferences"),
            Some("my-ws")
        );
        // Missing v1.
        assert_eq!(
            sync_prefs_ws_id("/api/workspaces/ws-1/calendar/sync-preferences"),
            None
        );
        // Extra trailing segment must not panic.
        assert_eq!(
            sync_prefs_ws_id("/api/v1/workspaces/ws-1/calendar/sync-preferences/extra"),
            None
        );
        // Wrong leaf.
        assert_eq!(
            sync_prefs_ws_id("/api/v1/workspaces/ws-1/calendar/categories"),
            None
        );
        // Short path must not panic.
        assert_eq!(sync_prefs_ws_id("/api/v1/workspaces"), None);
        // Empty ws-id segment.
        assert_eq!(
            sync_prefs_ws_id("/api/v1/workspaces//calendar/sync-preferences"),
            None
        );
    }

    // --- schema_missing ---

    #[test]
    fn schema_missing_detection() {
        assert!(schema_missing(r#"{"code":"PGRST204","message":"..."}"#));
        assert!(schema_missing(r#"{"code":"42703","message":"..."}"#));
        assert!(schema_missing(
            r#"{"code":"OTHER","message":"conflict_policy not found"}"#
        ));
        assert!(!schema_missing(
            r#"{"code":"23505","message":"duplicate key"}"#
        ));
        assert!(!schema_missing("not json"));
    }

    // --- err ---

    #[test]
    fn err_shape() {
        let r = err(403, "Workspace access denied");
        assert_eq!(r.status, 403);
        assert_eq!(r.body, json!({ "error": "Workspace access denied" }));
    }

    // --- build_options ---

    #[test]
    fn primary_calendar_label_and_external_join() {
        let cal = WsCalRow {
            id: Some("c1".to_owned()),
            name: Some("Work".to_owned()),
            color: None,
            calendar_type: Some("primary".to_owned()),
        };
        let tok = TokenRow {
            id: Some("t1".to_owned()),
            provider: Some("google".to_owned()),
            account_email: Some(json!("a@example.com")),
            account_name: None,
        };
        let conn = ConnRow {
            id: Some("co1".to_owned()),
            provider: Some("google".to_owned()),
            auth_token_id: Some("t1".to_owned()),
            calendar_id: Some("primary".to_owned()),
            calendar_name: Some("Alice".to_owned()),
            color: None,
            workspace_calendar_id: None,
            access_role: None,
        };
        let opts = build_options(&[cal], &[tok], &[conn]);
        assert_eq!(opts.len(), 2);
        assert_eq!(opts[0]["label"], "Tuturuuu Primary");
        assert_eq!(opts[0]["primary"], true);
        assert_eq!(opts[1]["id"], "google:co1");
        assert_eq!(opts[1]["accountEmail"], "a@example.com");
    }

    #[test]
    fn mismatched_provider_skips_connection() {
        let tok = TokenRow {
            id: Some("t1".to_owned()),
            provider: Some("google".to_owned()),
            account_email: None,
            account_name: None,
        };
        let conn = ConnRow {
            id: Some("co1".to_owned()),
            provider: Some("microsoft".to_owned()),
            auth_token_id: Some("t1".to_owned()),
            calendar_id: Some("cal".to_owned()),
            calendar_name: Some("Cal".to_owned()),
            color: None,
            workspace_calendar_id: None,
            access_role: None,
        };
        assert_eq!(build_options(&[], &[tok], &[conn]).len(), 0);
    }
}
