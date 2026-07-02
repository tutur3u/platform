//! Handler for `GET /api/v1/workspaces/:wsId/ai/memory/settings`.
//!
//! Ports the GET method of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/ai/memory/settings/route.ts`.
//! (The legacy route also exposes `PATCH`; that mutation is intentionally NOT
//! migrated here — this handler returns `None` for every non-`GET` method so the
//! worker falls through to the still-live Next.js route.)
//!
//! Auth model (legacy GET): authenticate the Supabase session user, normalize the
//! workspace id (`internal`/`personal` slug, handle, or UUID), then require
//! **workspace membership of type `MEMBER`** via `verifyWorkspaceMembershipType`.
//! There is no specific permission gate, so this port reproduces the
//! membership-only check directly (token -> user -> `workspace_members` lookup
//! with the caller token) rather than using `authorize_workspace_permission`,
//! which would over-restrict members without any assigned role permissions.
//!
//! Legacy status codes preserved:
//!
//!   * no authenticated user                            -> `401 { "error": "Unauthorized" }`
//!   * workspace normalization / membership lookup fail -> `500 { "error": "Internal server error" }`
//!   * not a `MEMBER` (missing row or wrong type)       -> `403 { "error": "Forbidden" }`
//!   * `private.get_ai_memory_settings` RPC failure     -> `500 { "error": "Failed to load memory settings" }`
//!   * success                                          -> `200 { "enabled", "productEnabled", "products" }`
//!
//! BEHAVIOR GAPS:
//!
//!   * The legacy route returns `422 { "error": "Invalid workspace identifier" }`
//!     when workspace normalization throws; this port maps that to a `500` (the
//!     normalization helpers used here return `Err(())` on failure rather than
//!     distinguishing invalid-identifier errors from transport errors).
//!   * `NextResponse.json` does not set a `Cache-Control` header on success; this
//!     port emits `no-store` (the backend read convention) to prevent intermediary
//!     caching of authenticated user data.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/ai/memory/settings";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";

const PRIVATE_SCHEMA: &str = "private";
const RPC_GET_AI_MEMORY_SETTINGS: &str = "get_ai_memory_settings";

/// All valid `AiMemoryProduct` values (mirrors `AI_MEMORY_PRODUCTS` in
/// `packages/ai/src/memory/types.ts`). Any unknown `?product=` query value
/// falls back to `"mira"`.
const VALID_PRODUCTS: &[&str] = &[
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
const DEFAULT_PRODUCT: &str = "mira";

#[derive(Clone, Copy)]
enum MembershipError {
    Unauthorized,
    LookupFailed,
    Forbidden,
}

#[derive(Deserialize)]
struct IdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct SettingsRow {
    enabled: Option<bool>,
    product_enabled: Option<bool>,
    products: Option<Value>,
}

pub(crate) async fn handle_workspaces_wsid_ai_memory_settings_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = ai_memory_settings_ws_id(request.path)?;

    Some(match request.method {
        "GET" => ai_memory_settings_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn ai_memory_settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    let (ws_id, user_id) =
        match authorize_membership(contact_data, request, raw_ws_id, outbound).await {
            Ok(pair) => pair,
            Err(MembershipError::Unauthorized) => return error_response(401, "Unauthorized"),
            Err(MembershipError::LookupFailed) => {
                return error_response(500, "Internal server error");
            }
            Err(MembershipError::Forbidden) => return error_response(403, "Forbidden"),
        };

    let product = normalize_product(query_param(request.url, "product").as_deref());

    match fetch_ai_memory_settings(contact_data, outbound, &ws_id, &user_id, &product).await {
        Ok(row) => {
            let enabled = row.as_ref().and_then(|r| r.enabled).unwrap_or(true);
            let product_enabled = row.as_ref().and_then(|r| r.product_enabled).unwrap_or(true);
            let products = row.and_then(|r| r.products).unwrap_or_else(|| json!({}));

            no_store_response(json_response(
                200,
                json!({
                    "enabled": enabled,
                    "productEnabled": product_enabled,
                    "products": products,
                }),
            ))
        }
        Err(()) => error_response(500, "Failed to load memory settings"),
    }
}

// ---------------------------------------------------------------------------
// Membership authorization (mirror of verifyWorkspaceMembershipType, MEMBER)
// ---------------------------------------------------------------------------

async fn authorize_membership(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<(String, String), MembershipError> {
    let access_token =
        supabase_auth::request_access_token(request).ok_or(MembershipError::Unauthorized)?;
    let user = supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
        .await
        .ok_or(MembershipError::Unauthorized)?;
    let user_id = user
        .id
        .filter(|id| !id.trim().is_empty())
        .ok_or(MembershipError::Unauthorized)?;

    let ws_id = normalize_ws_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;

    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(MembershipError::LookupFailed)?;
    let response = caller_get(contact_data, outbound, &url, &access_token)
        .await
        .map_err(|_| MembershipError::LookupFailed)?;
    if !is_success(response.status) {
        return Err(MembershipError::LookupFailed);
    }

    let membership = response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| MembershipError::LookupFailed)?
        .into_iter()
        .next()
        .ok_or(MembershipError::Forbidden)?;

    if membership.membership_type.as_deref() == Some("MEMBER") {
        Ok((ws_id, user_id))
    } else {
        Err(MembershipError::Forbidden)
    }
}

async fn normalize_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = if raw_ws_id.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        raw_ws_id.to_owned()
    };

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_lookup_identifier(&handle) {
            if let Some(id) =
                workspace_id_by_handle(contact_data, outbound, &handle, Some(access_token)).await?
            {
                return Ok(id);
            }
            if let Some(id) = workspace_id_by_handle(contact_data, outbound, &handle, None).await? {
                return Ok(id);
            }
        }
    }

    Ok(resolved)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let url = contact_data
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: Option<&str>,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = match access_token {
        Some(token) => caller_get(contact_data, outbound, &url, token).await?,
        None => service_get(contact_data, outbound, &url).await?,
    };
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<IdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// RPC call to `private.get_ai_memory_settings`
// ---------------------------------------------------------------------------

async fn fetch_ai_memory_settings(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    product: &str,
) -> Result<Option<SettingsRow>, ()> {
    let url = contact_data.rpc_url(RPC_GET_AI_MEMORY_SETTINGS).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    let body_json = serde_json::to_string(&json!({
        "p_product": product,
        "p_user_id": user_id,
        "p_ws_id": ws_id,
    }))
    .map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_body(&body_json),
        )
        .await
        .map_err(|_| ())?;

    if !is_success(response.status) {
        return Err(());
    }

    // Supabase serializes an RPC that returns SETOF as `[{...}]`.
    // Mirror the TypeScript `Array.isArray(data) ? data[0] : data` pattern.
    let rows = response.json::<Vec<SettingsRow>>().map_err(|_| ())?;
    Ok(rows.into_iter().next())
}

// ---------------------------------------------------------------------------
// Outbound helpers
// ---------------------------------------------------------------------------

async fn service_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, service_role_key, service_role_key).await
}

async fn caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    send_get(outbound, url, access_token, service_role_key).await
}

async fn send_get(
    outbound: &impl OutboundHttpClient,
    url: &str,
    bearer_token: &str,
    apikey: &str,
) -> Result<OutboundResponse, ()> {
    let authorization = format!("Bearer {bearer_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", apikey),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/// Extract `:wsId` from `/api/v1/workspaces/:wsId/ai/memory/settings`.
fn ai_memory_settings_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

/// Return the `?product=` query value if it is a known `AiMemoryProduct`;
/// otherwise fall back to `"mira"` (mirrors `normalizeProduct` in the legacy
/// route).
fn normalize_product(raw: Option<&str>) -> String {
    match raw {
        Some(value) if VALID_PRODUCTS.contains(&value) => value.to_owned(),
        _ => DEFAULT_PRODUCT.to_owned(),
    }
}

fn query_param(request_url: Option<&str>, key: &str) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == key && !value.is_empty()).then(|| value.into_owned()))
}

fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

fn is_direct_lookup_identifier(value: &str) -> bool {
    let normalized = value.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests (pure / sync helpers only; async integration tests live in lib.rs)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- path guard ----

    #[test]
    fn path_guard_extracts_ws_id() {
        assert_eq!(
            ai_memory_settings_ws_id(
                "/api/v1/workspaces/11111111-1111-4111-8111-111111111111/ai/memory/settings"
            ),
            Some("11111111-1111-4111-8111-111111111111")
        );
        assert_eq!(
            ai_memory_settings_ws_id("/api/v1/workspaces/personal/ai/memory/settings"),
            Some("personal")
        );
        assert_eq!(
            ai_memory_settings_ws_id("/api/v1/workspaces/my-workspace/ai/memory/settings"),
            Some("my-workspace")
        );
    }

    #[test]
    fn path_guard_rejects_non_matching_paths() {
        // Empty wsId segment.
        assert_eq!(
            ai_memory_settings_ws_id("/api/v1/workspaces//ai/memory/settings"),
            None
        );
        // Extra segment inside wsId (would contain a slash).
        assert_eq!(
            ai_memory_settings_ws_id("/api/v1/workspaces/a/b/ai/memory/settings"),
            None
        );
        // Wrong suffix.
        assert_eq!(
            ai_memory_settings_ws_id("/api/v1/workspaces/ws-1/ai/memory/settings/extra"),
            None
        );
        // Missing /v1/ segment.
        assert_eq!(
            ai_memory_settings_ws_id("/api/workspaces/ws-1/ai/memory/settings"),
            None
        );
        // Unrelated path.
        assert_eq!(ai_memory_settings_ws_id("/api/health"), None);
    }

    // ---- product normalization ----

    #[test]
    fn normalize_product_accepts_valid_products() {
        assert_eq!(normalize_product(Some("mira")), "mira");
        assert_eq!(normalize_product(Some("ai_chat")), "ai_chat");
        assert_eq!(normalize_product(Some("tasks")), "tasks");
        assert_eq!(normalize_product(Some("teach")), "teach");
    }

    #[test]
    fn normalize_product_falls_back_to_mira_for_unknown_or_missing() {
        assert_eq!(normalize_product(None), "mira");
        assert_eq!(normalize_product(Some("")), "mira");
        assert_eq!(normalize_product(Some("unknown")), "mira");
        assert_eq!(normalize_product(Some("MIRA")), "mira"); // case-sensitive
    }

    // ---- uuid / handle helpers ----

    #[test]
    fn is_uuid_literal_accepts_valid_uuids() {
        assert!(is_uuid_literal("11111111-1111-4111-8111-111111111111"));
        assert!(is_uuid_literal("00000000-0000-0000-0000-000000000000"));
    }

    #[test]
    fn is_uuid_literal_rejects_non_uuids() {
        assert!(!is_uuid_literal("personal"));
        assert!(!is_uuid_literal("my-workspace"));
        assert!(!is_uuid_literal(""));
    }

    #[test]
    fn is_workspace_handle_accepts_valid_handles() {
        assert!(is_workspace_handle("acme"));
        assert!(is_workspace_handle("my-org"));
        assert!(is_workspace_handle("my_org"));
        assert!(is_workspace_handle("org123"));
    }

    #[test]
    fn is_workspace_handle_rejects_invalid_handles() {
        assert!(!is_workspace_handle(""));
        assert!(!is_workspace_handle("-starts-with-dash"));
        assert!(!is_workspace_handle("ends-with-dash-"));
        assert!(!is_workspace_handle("UPPERCASE"));
    }
}
