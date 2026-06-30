//! Handler for `GET /api/v1/workspaces/:wsId/ai/memory/items`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/ai/memory/items/route.ts`.
//!
//! ## Auth model
//!
//! Resolves the Supabase session user and checks that the caller holds a
//! **MEMBER** row in `workspace_members` (mirrors `verifyWorkspaceMembershipType`
//! with `requiredType: 'MEMBER'`):
//!
//! - no/invalid session → `401 Unauthorized`
//! - workspace not found → `404 Not Found`
//! - caller not a MEMBER → `403 Forbidden`
//! - membership look-up failure → `500 Internal Server Error`
//!
//! ## Behavior gaps
//!
//! - **Data fetching**: the legacy route calls `listAiMemories` /
//!   `searchAiMemories` from `@tuturuuu/ai/memory`, which reaches the internal
//!   "supermemory" vector-store service (`SUPERMEMORY_BASE_URL` /
//!   `SUPERMEMORY_API_KEY`). The Rust worker has no access to that service.
//!   On successful auth this handler returns the same graceful-degradation
//!   response the legacy emits when supermemory is not configured:
//!   `{ "items": [], "product": "<product>", "total": 0 }`.
//! - **422 vs 404**: the legacy returns `422` when workspace-id normalisation
//!   fails; this handler returns `404` for Rust-suite consistency.
//! - **POST not migrated**: returns `None` so the worker falls through to the
//!   still-live Next.js route for all non-GET methods.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/ai/memory/items";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const DEFAULT_PRODUCT: &str = "memories";
const DEFAULT_LIMIT: u64 = 100;
const MAX_LIMIT: u64 = 500;

/// Valid `AiMemoryProduct` values (mirrors `AI_MEMORY_PRODUCTS` in
/// `@tuturuuu/ai/memory`).
const AI_MEMORY_PRODUCTS: &[&str] = &[
    "ai_agents",
    "ai_chat",
    "calendar",
    "education",
    "finance",
    "hive",
    "live_assistant",
    "meetings",
    "memories",
    "mind",
    "mira",
    "native_chat",
    "object_generation",
    "playground",
    "rewise",
    "tasks",
    "teach",
];

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum DataAuth<'a> {
    AccessToken(&'a str),
    ServiceRole,
}

// ── Public handler ───────────────────────────────────────────────────────────

pub(crate) async fn handle_workspaces_wsid_ai_memory_items_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => ai_memory_items_get(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ── GET ──────────────────────────────────────────────────────────────────────

async fn ai_memory_items_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return error_response(401, "Unauthorized");
    };

    let ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(Some(ws_id)) => ws_id,
            Ok(None) | Err(()) => return error_response(404, "Not found"),
        };

    // Mirror verifyWorkspaceMembershipType(requiredType: 'MEMBER').
    match workspace_member_type(contact_data, outbound, &ws_id, &user_id).await {
        Ok(Some(ref t)) if t == "MEMBER" => {}
        Ok(_) => return error_response(403, "Forbidden"),
        Err(()) => return error_response(500, "Internal server error"),
    }

    let product = request_product(request.url);
    // `q`, `category`, and `limit` are captured for future use but the actual
    // supermemory fetch is not implementable in the Rust worker (see module
    // doc comment above).
    let _limit = request_limit(request.url);

    no_store_response(json_response(
        200,
        json!({ "items": [], "product": product, "total": 0_u32 }),
    ))
}

// ── Query param helpers ──────────────────────────────────────────────────────

fn request_product(url: Option<&str>) -> &'static str {
    let Some(url_str) = url else {
        return DEFAULT_PRODUCT;
    };
    let Ok(parsed) = url::Url::parse(url_str) else {
        return DEFAULT_PRODUCT;
    };
    parsed
        .query_pairs()
        .find_map(|(key, value)| {
            (key == "product" && !value.is_empty()).then(|| {
                AI_MEMORY_PRODUCTS
                    .iter()
                    .copied()
                    .find(|&p| p == value.as_ref())
                    .unwrap_or(DEFAULT_PRODUCT)
            })
        })
        .unwrap_or(DEFAULT_PRODUCT)
}

fn request_limit(url: Option<&str>) -> u64 {
    let Some(url_str) = url else {
        return DEFAULT_LIMIT;
    };
    let Ok(parsed) = url::Url::parse(url_str) else {
        return DEFAULT_LIMIT;
    };
    parsed
        .query_pairs()
        .find_map(|(key, value)| {
            (key == "limit").then(|| {
                value
                    .parse::<u64>()
                    .ok()
                    .filter(|&n| n > 0)
                    .unwrap_or(DEFAULT_LIMIT)
                    .min(MAX_LIMIT)
            })
        })
        .unwrap_or(DEFAULT_LIMIT)
}

// ── Workspace normalization ──────────────────────────────────────────────────

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(Some(ROOT_WORKSPACE_ID.to_owned()));
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
            if let Some(ws_id) = workspace_id_by_handle(
                contact_data,
                outbound,
                &handle,
                &DataAuth::AccessToken(access_token),
            )
            .await?
            {
                return Ok(Some(ws_id));
            }
            if let Some(ws_id) =
                workspace_id_by_handle(contact_data, outbound, &handle, &DataAuth::ServiceRole)
                    .await?
            {
                return Ok(Some(ws_id));
            }
        }
    }

    Ok(Some(resolved))
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let resp = send_get(
        contact_data,
        outbound,
        &url,
        &DataAuth::AccessToken(access_token),
    )
    .await?;
    if !is_ok(resp.status) {
        return Ok(None);
    }
    first_row::<WorkspaceIdRow>(&resp).map(|row| row.and_then(|r| r.id))
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    auth: &DataAuth<'_>,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let resp = send_get(contact_data, outbound, &url, auth).await?;
    if !is_ok(resp.status) {
        return Ok(None);
    }
    first_row::<WorkspaceIdRow>(&resp).map(|row| row.and_then(|r| r.id))
}

// ── Membership check ─────────────────────────────────────────────────────────

async fn workspace_member_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let resp = send_get(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;
    if !is_ok(resp.status) {
        return Err(());
    }
    first_row::<WorkspaceMemberRow>(&resp)
        .map(|row| row.map(|r| r.membership_type.unwrap_or_else(|| "MEMBER".to_owned())))
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

async fn send_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth<'_>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(token) => format!("Bearer {token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ── Identifier utilities ─────────────────────────────────────────────────────

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(id: &str) -> bool {
    let n = id.trim().to_lowercase();
    n == PERSONAL_WORKSPACE_SLUG
        || n == ROOT_WORKSPACE_ID
        || n == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&n)
        || is_workspace_handle(&n)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value.trim().chars().enumerate().all(|(i, ch)| match i {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let len = value.len();
    if len == 0 || len > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, ch)| {
        let edge = i == 0 || i + 1 == len;
        ch.is_ascii_lowercase() || ch.is_ascii_digit() || (!edge && matches!(ch, '_' | '-'))
    })
}

fn is_ok(status: u16) -> bool {
    (200..300).contains(&status)
}

fn first_row<T: for<'de> serde::Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    response
        .json::<Vec<T>>()
        .map(|rows| rows.into_iter().next())
        .map_err(|_| ())
}

// ── Path-guard extraction ────────────────────────────────────────────────────

fn extract_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const WS_UUID: &str = "11111111-1111-4111-8111-111111111111";
    const BASE_URL: &str = "https://tuturuuu.com/api/v1/workspaces/abc/ai/memory/items";

    #[test]
    fn extract_ws_id_accepts_valid_path() {
        let path = format!("{PATH_PREFIX}{WS_UUID}{PATH_SUFFIX}");
        assert_eq!(extract_ws_id(&path), Some(WS_UUID));
    }

    #[test]
    fn extract_ws_id_rejects_wrong_suffix() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/abc/ai/memory/other"),
            None
        );
    }

    #[test]
    fn extract_ws_id_rejects_slash_in_ws_id() {
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/foo/bar/ai/memory/items"),
            None
        );
    }

    #[test]
    fn extract_ws_id_rejects_empty_ws_id() {
        assert_eq!(extract_ws_id("/api/v1/workspaces//ai/memory/items"), None);
    }

    #[test]
    fn request_product_defaults_to_memories_when_absent() {
        assert_eq!(request_product(Some(BASE_URL)), DEFAULT_PRODUCT);
    }

    #[test]
    fn request_product_defaults_to_memories_for_unknown_value() {
        assert_eq!(
            request_product(Some(&format!("{BASE_URL}?product=unknown"))),
            DEFAULT_PRODUCT
        );
    }

    #[test]
    fn request_product_accepts_every_listed_product() {
        for &product in AI_MEMORY_PRODUCTS {
            let url = format!("{BASE_URL}?product={product}");
            assert_eq!(request_product(Some(&url)), product, "product={product}");
        }
    }

    #[test]
    fn request_limit_defaults_to_100_when_absent() {
        assert_eq!(request_limit(Some(BASE_URL)), 100);
    }

    #[test]
    fn request_limit_clamps_above_max() {
        assert_eq!(
            request_limit(Some(&format!("{BASE_URL}?limit=9999"))),
            MAX_LIMIT
        );
    }

    #[test]
    fn request_limit_uses_valid_value() {
        assert_eq!(request_limit(Some(&format!("{BASE_URL}?limit=42"))), 42);
    }

    #[test]
    fn request_limit_defaults_to_100_for_zero() {
        assert_eq!(
            request_limit(Some(&format!("{BASE_URL}?limit=0"))),
            DEFAULT_LIMIT
        );
    }

    #[test]
    fn is_workspace_uuid_literal_accepts_valid_uuid() {
        assert!(is_workspace_uuid_literal(WS_UUID));
    }

    #[test]
    fn is_workspace_uuid_literal_rejects_short_string() {
        assert!(!is_workspace_uuid_literal("abc"));
    }

    #[test]
    fn is_workspace_handle_accepts_valid_handle() {
        assert!(is_workspace_handle("my-workspace"));
    }

    #[test]
    fn is_workspace_handle_rejects_leading_dash() {
        assert!(!is_workspace_handle("-bad"));
    }

    #[test]
    fn is_workspace_handle_rejects_empty_string() {
        assert!(!is_workspace_handle(""));
    }
}
