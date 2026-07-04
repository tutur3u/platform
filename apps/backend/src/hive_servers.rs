//! Handler for `GET /api/v1/hive/servers`.
//!
//! Ports the GET path of the legacy Next.js route at
//! `apps/web/src/app/api/v1/hive/servers/route.ts`.
//!
//! Legacy auth model (`requireHiveAccess` in
//! `apps/web/src/app/api/v1/hive/_shared.ts`):
//!
//! 1. Resolve the caller. A Hive app-session token (`targetApp: 'hive'`) is
//!    accepted; otherwise the Supabase auth user is resolved from the request.
//!    No user -> `401 { "error": "Unauthorized" }`.
//! 2. Resolve Hive access (`resolveWebHiveAccess`): `isMember` (an enabled
//!    `hive_members` row) and `isAdmin` (an enabled `platform_user_roles` row
//!    with `allow_role_management`). A resolution failure ->
//!    `500 { "error": "Failed to resolve Hive access" }`.
//! 3. Neither member nor admin -> `403 { "error": "Hive access required" }`.
//!
//! On success the legacy `listHiveServers(isAdmin)` call selects all columns
//! from the Hive Postgres database ordered by `created_at asc`. When the caller
//! is not an admin only rows with `enabled = true` are included.
//!
//! The response body is:
//!
//! ```json
//! { "isAdmin": <bool>, "servers": [ { ...mapHiveServer fields... } ] }
//! ```
//!
//! Each server is mapped via `mapHiveServer` to:
//! `{ createdAt, description, enabled, id, maxPlayers, name, ollamaState,
//! settings, slug, totalCurrency }`.
//!
//! A read failure -> `500 { "error": "Failed to list Hive servers" }`.
//!
//! BEHAVIOR GAPS:
//!   * The legacy `listHiveServers` reads from a dedicated Hive Postgres
//!     database (`HIVE_DATABASE_URL` / `getHiveSql()`). This port reads the
//!     Supabase `hive_servers` table with the service-role client. If the two
//!     stores diverge the listed rows may differ from the legacy source of truth.
//!   * The legacy route sets no explicit `Cache-Control` header. This handler
//!     emits `no-store` on every response, matching the convention used by the
//!     sibling Hive handlers for dynamic, access-gated reads.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    hive_access::{authenticated_user, resolve_hive_access},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const HIVE_SERVERS_PATH: &str = "/api/v1/hive/servers";
const HIVE_SERVERS_TABLE: &str = "hive_servers";
const HIVE_SERVERS_SELECT: &str =
    "id,name,slug,description,enabled,max_players,total_currency,settings,ollama_state,created_at";

/// Only the `hive` app-session target is accepted, mirroring
/// `resolveHiveRequestUser` which verifies tokens with `targetApp: 'hive'`.
const HIVE_APP_SESSION_TARGETS: &[&str] = &["hive"];

#[derive(Deserialize)]
struct HiveServerRow {
    id: String,
    name: String,
    slug: String,
    description: Option<String>,
    enabled: Option<bool>,
    max_players: Option<i64>,
    total_currency: Option<serde_json::Value>,
    settings: Option<serde_json::Value>,
    ollama_state: Option<serde_json::Value>,
    created_at: Option<String>,
}

pub(crate) async fn handle_hive_servers_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if !hive_servers_path_matches(request.path) {
        return None;
    }

    Some(match request.method {
        "GET" => hive_servers_get(config, request, outbound).await,
        // Non-GET methods (POST, etc.) fall through to the still-live Next.js route.
        _ => return None,
    })
}

async fn hive_servers_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_user(config, request, HIVE_APP_SESSION_TARGETS, outbound).await {
        Ok(user) => user,
        Err(()) => return error_response(401, "Unauthorized"),
    };

    let access = match resolve_hive_access(&config.contact_data, &user.id, outbound).await {
        Ok(access) => access,
        Err(()) => return error_response(500, "Failed to resolve Hive access"),
    };

    if !access.has_access() {
        return error_response(403, "Hive access required");
    }

    let is_admin = access.is_admin;

    match fetch_hive_servers(&config.contact_data, is_admin, outbound).await {
        Ok(servers) => no_store_response(json_response(
            200,
            json!({ "isAdmin": is_admin, "servers": servers }),
        )),
        Err(()) => error_response(500, "Failed to list Hive servers"),
    }
}

async fn fetch_hive_servers(
    contact_data: &contact::ContactDataConfig,
    is_admin: bool,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    // Admins see all servers; non-admins see only enabled servers.
    // Both sets are ordered by created_at asc, mirroring the legacy Postgres queries.
    let mut params = vec![
        ("select", HIVE_SERVERS_SELECT.to_owned()),
        ("order", "created_at.asc".to_owned()),
    ];
    if !is_admin {
        params.push(("enabled", "eq.true".to_owned()));
    }

    let Some(url) = contact_data.rest_url(HIVE_SERVERS_TABLE, &params) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<HiveServerRow>>().map_err(|_| ())?;
    Ok(rows.iter().map(map_hive_server).collect())
}

/// Mirrors `mapHiveServer` from the legacy `_shared.ts`.
fn map_hive_server(row: &HiveServerRow) -> Value {
    let total_currency = row
        .total_currency
        .as_ref()
        .and_then(|v| {
            if let Some(n) = v.as_f64() {
                return Some(n);
            }
            if let Some(s) = v.as_str() {
                return s.parse::<f64>().ok();
            }
            None
        })
        .unwrap_or(0.0);

    let ollama_state = row.ollama_state.clone().unwrap_or_else(|| json!({}));

    let settings = row.settings.clone().unwrap_or_else(|| json!({}));

    json!({
        "createdAt": row.created_at,
        "description": row.description,
        "enabled": row.enabled,
        "id": row.id,
        "maxPlayers": row.max_players,
        "name": row.name,
        "ollamaState": ollama_state,
        "settings": settings,
        "slug": row.slug,
        "totalCurrency": total_currency,
    })
}

fn hive_servers_path_matches(path: &str) -> bool {
    path == HIVE_SERVERS_PATH
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_route_only() {
        assert!(hive_servers_path_matches("/api/v1/hive/servers"));
        assert!(!hive_servers_path_matches("/api/v1/hive/servers/"));
        assert!(!hive_servers_path_matches("/api/v1/hive/servers/abc"));
        assert!(!hive_servers_path_matches("/api/hive/servers"));
        assert!(!hive_servers_path_matches("/api/v1/hive"));
        assert!(!hive_servers_path_matches(""));
    }

    #[test]
    fn map_hive_server_matches_legacy_shape() {
        let row = HiveServerRow {
            id: "srv-1".to_owned(),
            name: "Main".to_owned(),
            slug: "main".to_owned(),
            description: Some("A server".to_owned()),
            enabled: Some(true),
            max_players: Some(32),
            total_currency: Some(json!("1500")),
            settings: Some(json!({ "llmProvider": "mira" })),
            ollama_state: Some(json!({ "status": "idle" })),
            created_at: Some("2026-01-01T00:00:00Z".to_owned()),
        };

        let mapped = map_hive_server(&row);

        assert_eq!(mapped["id"], json!("srv-1"));
        assert_eq!(mapped["name"], json!("Main"));
        assert_eq!(mapped["slug"], json!("main"));
        assert_eq!(mapped["description"], json!("A server"));
        assert_eq!(mapped["enabled"], json!(true));
        assert_eq!(mapped["maxPlayers"], json!(32));
        assert_eq!(mapped["totalCurrency"], json!(1500.0));
        assert_eq!(mapped["settings"], json!({ "llmProvider": "mira" }));
        assert_eq!(mapped["ollamaState"], json!({ "status": "idle" }));
        assert_eq!(mapped["createdAt"], json!("2026-01-01T00:00:00Z"));
        // Exactly ten legacy keys.
        assert_eq!(mapped.as_object().map(|o| o.len()), Some(10));
    }

    #[test]
    fn map_hive_server_defaults_nulls_and_zeros() {
        let row = HiveServerRow {
            id: "srv-2".to_owned(),
            name: "Empty".to_owned(),
            slug: "empty".to_owned(),
            description: None,
            enabled: None,
            max_players: None,
            total_currency: None,
            settings: None,
            ollama_state: None,
            created_at: None,
        };

        let mapped = map_hive_server(&row);

        assert_eq!(mapped["description"], Value::Null);
        assert_eq!(mapped["createdAt"], Value::Null);
        assert_eq!(mapped["totalCurrency"], json!(0.0));
        assert_eq!(mapped["settings"], json!({}));
        assert_eq!(mapped["ollamaState"], json!({}));
    }

    #[test]
    fn map_hive_server_total_currency_as_number() {
        let row = HiveServerRow {
            id: "srv-3".to_owned(),
            name: "Rich".to_owned(),
            slug: "rich".to_owned(),
            description: None,
            enabled: Some(true),
            max_players: Some(64),
            total_currency: Some(json!(9999.5)),
            settings: None,
            ollama_state: None,
            created_at: None,
        };

        let mapped = map_hive_server(&row);
        assert_eq!(mapped["totalCurrency"], json!(9999.5));
    }
}
