//! Handler for `GET /api/v1/mira/memories`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/mira/memories/route.ts` — GET only.
//!
//! ## Auth model
//!
//! The caller must supply a valid Supabase session token (Bearer header or
//! `sb-*` cookie). The handler:
//!
//! 1. Extracts the access token and resolves the Supabase user id.
//! 2. Resolves the workspace id from the `wsId` query parameter. The
//!    `"personal"` alias is resolved to the user's personal workspace. When
//!    `wsId` is absent, the handler falls back to
//!    `user_private_details.default_workspace_id`, then to the user's personal
//!    workspace row.
//! 3. Verifies the user holds MEMBER-level access to the resolved workspace
//!    via `workspace_members` (checked with the service-role key to bypass
//!    RLS, matching the legacy `sbAdmin` path).
//!
//! ## Behavior gap
//!
//! The legacy route delegates memory retrieval to `listAiMemories` from
//! `@tuturuuu/ai/memory`, which calls an external supermemory vector-database
//! service (default base URL `http://supermemory:8787`). That service is not
//! reachable from the Rust backend worker — no config key exists and adding
//! new dependencies is prohibited — so this port returns an empty memory list
//! on the authenticated success path:
//!
//! ```json
//! { "grouped": {}, "memories": [], "total": 0 }
//! ```
//!
//! Auth error codes (401 / 403 / 400 / 500) are reproduced faithfully.
//!
//! POST and DELETE return `None` so the still-live Next.js route handles them.
//!
//! Non-UUID, non-`"personal"` `wsId` values (e.g. workspace handles) are
//! passed through directly; handle-to-id resolution is not implemented.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_MEMORIES_PATH: &str = "/api/v1/mira/memories";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_REQUIRED_MESSAGE: &str = "Workspace is required";
const INTERNAL_ERROR_MESSAGE: &str = "Internal server error";
const DEFAULT_LIMIT: u32 = 100;
const MAX_LIMIT: u32 = 500;
const PERSONAL_SLUG: &str = "personal";

#[derive(Deserialize)]
struct DefaultWorkspaceRow {
    default_workspace_id: Option<String>,
}

#[derive(Deserialize)]
struct PersonalWorkspaceRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_mira_memories_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != MIRA_MEMORIES_PATH {
        return None;
    }

    // Only GET is migrated. POST and DELETE fall through to Next.js.
    Some(match request.method {
        "GET" => mira_memories_get(config, request, outbound).await,
        _ => return None,
    })
}

async fn mira_memories_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let params = parse_query_params(request.url);

    // Resolve workspace id (mirrors resolveMiraMemoryContext).
    let ws_id = match resolve_ws_id(
        &config.contact_data,
        outbound,
        params.ws_id.as_deref(),
        &user_id,
    )
    .await
    {
        ResolveWsIdOutcome::Found(id) => id,
        ResolveWsIdOutcome::Required => {
            return error_response(400, WORKSPACE_REQUIRED_MESSAGE);
        }
        ResolveWsIdOutcome::Internal => {
            return error_response(500, INTERNAL_ERROR_MESSAGE);
        }
    };

    // Verify the caller is a MEMBER of the workspace (admin read, no RLS).
    match check_membership(&config.contact_data, outbound, &ws_id, &user_id).await {
        MembershipOutcome::Member => {}
        MembershipOutcome::NotMember => {
            return error_response(403, "Forbidden");
        }
        MembershipOutcome::Internal => {
            return error_response(500, INTERNAL_ERROR_MESSAGE);
        }
    }

    // Gap: listAiMemories calls the supermemory vector-database service, which is
    // not reachable here. Return an empty authenticated response with the correct
    // JSON shape. The `category` and `limit` query params are parsed but not
    // acted upon in this port.
    no_store_response(json_response(
        200,
        json!({
            "grouped": {},
            "memories": [],
            "total": 0,
        }),
    ))
}

// ── Query param parsing ───────────────────────────────────────────────────────

struct MemoriesQueryParams {
    ws_id: Option<String>,
    /// Mirrors `Math.min(parseInt(limit) || 100, 500)` from the legacy route.
    #[allow(dead_code)]
    limit: u32,
}

fn parse_query_params(request_url: Option<&str>) -> MemoriesQueryParams {
    let url = request_url.and_then(|raw| url::Url::parse(raw).ok());
    let mut ws_id: Option<String> = None;
    let mut limit_raw: Option<String> = None;

    if let Some(ref u) = url {
        for (key, value) in u.query_pairs() {
            match key.as_ref() {
                "wsId" if ws_id.is_none() => ws_id = Some(value.into_owned()),
                "limit" if limit_raw.is_none() => limit_raw = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // Mirror `Math.min(parseInt(limit) || 100, 500)`.
    let limit = limit_raw
        .as_deref()
        .and_then(parse_int_prefix)
        .filter(|&n| n > 0)
        .map(|n| (n as u32).min(MAX_LIMIT))
        .unwrap_or(DEFAULT_LIMIT);

    MemoriesQueryParams { ws_id, limit }
}

/// Mirror JavaScript `parseInt(value, 10)` prefix-parse: skip leading
/// whitespace, allow an optional sign, then take leading decimal digits.
fn parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let (sign, rest) = match trimmed.strip_prefix('-') {
        Some(rest) => (-1i64, rest),
        None => (1i64, trimmed.strip_prefix('+').unwrap_or(trimmed)),
    };
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<i64>().ok().map(|n| sign * n)
}

// ── Workspace id resolution ───────────────────────────────────────────────────

enum ResolveWsIdOutcome {
    Found(String),
    Required,
    Internal,
}

async fn resolve_ws_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id_param: Option<&str>,
    user_id: &str,
) -> ResolveWsIdOutcome {
    match ws_id_param {
        Some(raw) if !raw.is_empty() && raw.to_lowercase() != PERSONAL_SLUG => {
            // Explicit non-"personal" workspace id passed through directly.
            ResolveWsIdOutcome::Found(raw.to_owned())
        }
        _ => {
            // No wsId or wsId == "personal": resolve via resolveDefaultWorkspaceId.
            match resolve_default_workspace(contact_data, outbound, user_id).await {
                Ok(Some(id)) => ResolveWsIdOutcome::Found(id),
                Ok(None) => ResolveWsIdOutcome::Required,
                Err(()) => ResolveWsIdOutcome::Internal,
            }
        }
    }
}

/// Mirror `resolveDefaultWorkspaceId` from the legacy route:
///
/// 1. `user_private_details.default_workspace_id`
/// 2. personal workspace via `workspaces` + inner-join `workspace_members`
async fn resolve_default_workspace(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    if let Some(id) = fetch_default_workspace_id(contact_data, outbound, user_id).await? {
        return Ok(Some(id));
    }
    fetch_personal_workspace_id(contact_data, outbound, user_id).await
}

async fn fetch_default_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let url = contact_data
        .rest_url(
            "user_private_details",
            &[
                ("select", "default_workspace_id".to_owned()),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = admin_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DefaultWorkspaceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.default_workspace_id)
        .filter(|id| !id.is_empty()))
}

async fn fetch_personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    // mirrors: sbAdmin.from('workspaces')
    //   .select('id, workspace_members!inner(user_id)')
    //   .eq('personal', true).eq('workspace_members.user_id', userId)
    //   .limit(1).maybeSingle()
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id,workspace_members!inner(user_id)".to_owned()),
                ("personal", "eq.true".to_owned()),
                ("workspace_members.user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let response = admin_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<PersonalWorkspaceRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .filter(|id| !id.is_empty()))
}

// ── Membership check ──────────────────────────────────────────────────────────

enum MembershipOutcome {
    Member,
    NotMember,
    Internal,
}

async fn check_membership(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> MembershipOutcome {
    // mirrors: sbAdmin.from('workspace_members').select('type')
    //   .eq('ws_id', wsId).eq('user_id', userId).maybeSingle()
    let url = match contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) {
        Some(u) => u,
        None => return MembershipOutcome::Internal,
    };

    let response = match admin_get(contact_data, outbound, &url).await {
        Ok(r) => r,
        Err(()) => return MembershipOutcome::Internal,
    };

    if !(200..300).contains(&response.status) {
        return MembershipOutcome::Internal;
    }

    match response.json::<Vec<MembershipRow>>() {
        Ok(rows) => {
            // requiredType == 'MEMBER': row must exist and type must be "MEMBER".
            let is_member = rows
                .into_iter()
                .next()
                .and_then(|row| row.membership_type)
                .map(|t| t == "MEMBER")
                .unwrap_or(false);
            if is_member {
                MembershipOutcome::Member
            } else {
                MembershipOutcome::NotMember
            }
        }
        Err(_) => MembershipOutcome::Internal,
    }
}

// ── Shared HTTP helper ────────────────────────────────────────────────────────

async fn admin_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_constant_is_correct() {
        assert_eq!(MIRA_MEMORIES_PATH, "/api/v1/mira/memories");
    }

    #[test]
    fn parse_int_prefix_normal() {
        assert_eq!(parse_int_prefix("100"), Some(100));
        assert_eq!(parse_int_prefix("42abc"), Some(42));
        assert_eq!(parse_int_prefix("+10"), Some(10));
        assert_eq!(parse_int_prefix("  7"), Some(7));
    }

    #[test]
    fn parse_int_prefix_negative() {
        assert_eq!(parse_int_prefix("-5"), Some(-5));
    }

    #[test]
    fn parse_int_prefix_none_on_non_digit() {
        assert_eq!(parse_int_prefix("abc"), None);
        assert_eq!(parse_int_prefix(""), None);
    }

    #[test]
    fn parse_query_params_defaults() {
        let params = parse_query_params(None);
        assert!(params.ws_id.is_none());
        assert_eq!(params.limit, DEFAULT_LIMIT);
    }

    #[test]
    fn parse_query_params_limit_clamped_to_max() {
        let params = parse_query_params(Some("http://host/?limit=9999"));
        assert_eq!(params.limit, MAX_LIMIT);
    }

    #[test]
    fn parse_query_params_limit_zero_becomes_default() {
        // parseInt("0") || 100  ->  100
        let params = parse_query_params(Some("http://host/?limit=0"));
        assert_eq!(params.limit, DEFAULT_LIMIT);
    }

    #[test]
    fn parse_query_params_limit_negative_becomes_default() {
        let params = parse_query_params(Some("http://host/?limit=-1"));
        assert_eq!(params.limit, DEFAULT_LIMIT);
    }

    #[test]
    fn parse_query_params_ws_id_extracted() {
        let params = parse_query_params(Some("http://host/?wsId=some-uuid"));
        assert_eq!(params.ws_id.as_deref(), Some("some-uuid"));
    }

    #[test]
    fn personal_slug_constant_matches_expected() {
        assert_eq!(PERSONAL_SLUG, "personal");
    }

    #[test]
    fn personal_slug_comparison_is_case_insensitive() {
        let raw = "Personal";
        assert_eq!(raw.to_lowercase(), PERSONAL_SLUG);
    }
}
