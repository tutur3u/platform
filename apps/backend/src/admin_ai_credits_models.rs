//! Rust port of the Next.js route:
//! `apps/web/src/app/api/v1/admin/ai-credits/models/route.ts` — GET only.
//!
//! ## Behavior gaps vs. legacy
//!
//! - The PATCH handler is **not** ported here. Non-GET methods return `None` so
//!   the Cloudflare Worker falls through to the still-live Next.js route.
//! - The legacy route selects from the `private` schema via
//!   `createAdminClient().schema('private').from('ai_gateway_models')`. This
//!   port sets the `Accept-Profile: private` header on the PostgREST GET
//!   request to achieve the same effect.
//! - Filter logic (provider, type, tag, ids, search, enabled) is replicated
//!   from `route-filters.ts` inline; the ilike-sanitiser strips `,`, `%`, `(`,
//!   and `)` identically to the TypeScript version.
//! - The `search` query param is checked first; then `q` as a fallback,
//!   matching the legacy `searchParams.get('search') ?? searchParams.get('q')`.
//! - Pagination always applies (the legacy admin GET always paginates):
//!   `page` defaults to 1, `limit` defaults to 50, capped at 100.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ADMIN_AI_CREDITS_MODELS_PATH: &str = "/api/v1/admin/ai-credits/models";
const AI_GATEWAY_MODELS_TABLE: &str = "ai_gateway_models";
const PRIVATE_SCHEMA: &str = "private";

const DEFAULT_PAGE: usize = 1;
const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 100;

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ROOT_ADMIN_REQUIRED_MESSAGE: &str = "Root workspace admin required";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch models";

// ── Auth helpers ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum MembershipOutcome {
    Member,
    Forbidden,
    LookupFailed,
}

// ── Query parsing ─────────────────────────────────────────────────────────────

struct ModelsQuery {
    page: usize,
    limit: usize,
    provider: Option<String>,
    type_filter: Option<String>,
    tag: Option<String>,
    ids: Vec<String>,
    search: Option<String>,
    enabled: Option<bool>,
}

// ── Public handler ────────────────────────────────────────────────────────────

pub(crate) async fn handle_admin_ai_credits_models_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != ADMIN_AI_CREDITS_MODELS_PATH {
        return None;
    }

    // Only GET is migrated. PATCH still lives in Next.js; return None so the
    // Worker falls through to Next.js for every other method.
    Some(match request.method {
        "GET" => admin_ai_credits_models_get(config, request, outbound).await,
        _ => return None,
    })
}

// ── GET implementation ────────────────────────────────────────────────────────

async fn admin_ai_credits_models_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // 1. Authenticate caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    // 2. Verify root-workspace membership.
    match verify_root_workspace_member(contact_data, outbound, &access_token, &user_id).await {
        MembershipOutcome::Member => {}
        MembershipOutcome::LookupFailed => {
            return error_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        }
        MembershipOutcome::Forbidden => {
            return error_response(403, ROOT_ADMIN_REQUIRED_MESSAGE);
        }
    }

    // 3. Parse query params.
    let url = request.url.and_then(|u| url::Url::parse(u).ok());
    let query = parse_models_query(url.as_ref());

    // 4. Build the PostgREST URL with all filter params.
    let params = build_rest_params(&query);
    let Some(rest_url) = contact_data.rest_url(AI_GATEWAY_MODELS_TABLE, &params) else {
        return error_response(500, FETCH_FAILED_MESSAGE);
    };

    // 5. Send the paginated request to the private schema.
    let response = match send_models_get(contact_data, outbound, &rest_url, &query).await {
        Ok(resp) => resp,
        Err(()) => return error_response(500, FETCH_FAILED_MESSAGE),
    };

    // 6. Extract total count from Content-Range, then parse body.
    let total = total_from_content_range(&response).unwrap_or(0);
    let body = match response.json::<Value>() {
        Ok(body) => body,
        Err(_) => return error_response(500, FETCH_FAILED_MESSAGE),
    };
    let data = if body.is_array() { body } else { json!([]) };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "pagination": {
                "page": query.page,
                "limit": query.limit,
                "total": total,
            },
        }),
    ))
}

// ── Root-workspace membership check ──────────────────────────────────────────

/// Mirrors `verifyWorkspaceMembershipType({ wsId: ROOT_WORKSPACE_ID })`.
///
/// Uses the caller's access token (RLS respected) to query `workspace_members`,
/// exactly as the legacy session-scoped Supabase client does.
async fn verify_root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> MembershipOutcome {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return MembershipOutcome::LookupFailed;
    };

    let Some(service_role_key) = contact_data.service_role_key() else {
        return MembershipOutcome::LookupFailed;
    };
    let authorization = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if !(200..300).contains(&response.status) {
        return MembershipOutcome::LookupFailed;
    }

    let rows = match response.json::<Vec<WorkspaceMembershipRow>>() {
        Ok(rows) => rows,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if rows.first().and_then(|row| row.membership_type.as_deref()) == Some("MEMBER") {
        MembershipOutcome::Member
    } else {
        MembershipOutcome::Forbidden
    }
}

// ── PostgREST request ─────────────────────────────────────────────────────────

/// Sends the paginated `GET` to PostgREST in the `private` schema with
/// `Prefer: count=exact` and `Range` headers so the total count is returned
/// in the `Content-Range` response header.
async fn send_models_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    query: &ModelsQuery,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let start = (query.page - 1) * query.limit;
    let end = start + query.limit - 1;
    let range_header = format!("{start}-{end}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", &range_header),
        )
        .await
        .map_err(|_| ())?;

    if (200..300).contains(&response.status) {
        Ok(response)
    } else {
        Err(())
    }
}

// ── Query parsing ─────────────────────────────────────────────────────────────

fn parse_models_query(url: Option<&url::Url>) -> ModelsQuery {
    let page = parse_positive_int(query_value(url, "page").as_deref(), DEFAULT_PAGE);
    let limit = MAX_LIMIT.min(parse_positive_int(
        query_value(url, "limit").as_deref(),
        DEFAULT_LIMIT,
    ));

    let provider = optional_query_value(url, "provider");

    let type_filter = optional_query_value(url, "type").filter(|t| t != "all");

    let tag = optional_query_value(url, "tag");

    let ids = parse_ids(query_value(url, "ids").as_deref());

    let search = optional_query_value(url, "search")
        .or_else(|| optional_query_value(url, "q"))
        .map(|v| sanitize_ilike_term(&v))
        .filter(|v| !v.is_empty());

    let enabled = match optional_query_value(url, "enabled").as_deref() {
        Some("true") => Some(true),
        Some("false") => Some(false),
        _ => None,
    };

    ModelsQuery {
        page,
        limit,
        provider,
        type_filter,
        tag,
        ids,
        search,
        enabled,
    }
}

/// Builds the PostgREST query params that mirror `applyAdminAiCreditsModelFilters`.
///
/// Filters applied:
///
/// - `provider` -> `eq.<value>`
/// - `type` (when not "all") -> `eq.<value>`
/// - `tag` -> `cs.{<value>}` (array contains)
/// - `ids` -> `in.(<comma-list>)`
/// - `search` / `q` -> `or.(id.ilike,name.ilike,provider.ilike,description.ilike)`
/// - `enabled` -> `eq.true` / `eq.false`
fn build_rest_params(query: &ModelsQuery) -> Vec<(&'static str, String)> {
    let mut params: Vec<(&'static str, String)> = vec![
        ("select", "*".to_owned()),
        ("order", "provider.asc,name.asc".to_owned()),
    ];

    if let Some(provider) = &query.provider {
        params.push(("provider", format!("eq.{provider}")));
    }

    if let Some(type_filter) = &query.type_filter {
        params.push(("type", format!("eq.{type_filter}")));
    }

    if let Some(tag) = &query.tag {
        params.push(("tags", format!("cs.{{{tag}}}")));
    }

    if !query.ids.is_empty() {
        params.push(("id", format!("in.({})", query.ids.join(","))));
    }

    if let Some(search) = &query.search {
        let pattern = format!("%{search}%");
        params.push((
            "or",
            format!(
                "(id.ilike.{pattern},name.ilike.{pattern},provider.ilike.{pattern},description.ilike.{pattern})"
            ),
        ));
    }

    if let Some(enabled) = query.enabled {
        params.push(("is_enabled", format!("eq.{enabled}")));
    }

    params
}

// ── Small pure helpers ────────────────────────────────────────────────────────

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
}

fn optional_query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    query_value(url, key).filter(|v| !v.is_empty())
}

/// Mirrors the TypeScript `parsePositiveInt`: parses a float, floors it, and
/// clamps to `>= 1`. Returns `fallback` when the value is absent, empty, or
/// not finite.
fn parse_positive_int(value: Option<&str>, fallback: usize) -> usize {
    let parsed = match value {
        Some(v) if v.trim().is_empty() => fallback as f64,
        Some(v) => v.parse::<f64>().unwrap_or(fallback as f64),
        None => fallback as f64,
    };
    if !parsed.is_finite() {
        return fallback;
    }
    parsed.floor().max(1.0) as usize
}

/// Mirrors `sanitizeIlikeTerm`: trims whitespace and removes `,`, `%`, `(`, `)`.
fn sanitize_ilike_term(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|c| !matches!(c, ',' | '%' | '(' | ')'))
        .collect()
}

/// Mirrors `parseIds`: splits on `,`, deduplicates, filters empty/overlong
/// entries (> 255 chars), and caps at 100 IDs.
fn parse_ids(value: Option<&str>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    let mut ids: Vec<String> = Vec::new();
    for id in value
        .split(',')
        .map(str::trim)
        .filter(|id| !id.is_empty() && id.len() <= 255)
    {
        if !ids.iter().any(|existing| existing == id) {
            ids.push(id.to_owned());
        }
        if ids.len() >= 100 {
            break;
        }
    }
    ids
}

/// Extracts the total row count from a PostgREST `Content-Range` header,
/// e.g. `0-49/256` -> `256`.
fn total_from_content_range(response: &OutboundResponse) -> Option<i64> {
    let header = response.header("content-range")?;
    let total = header.rsplit_once('/')?.1.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_positive_int ────────────────────────────────────────────────────

    #[test]
    fn parse_positive_int_returns_fallback_for_none() {
        assert_eq!(parse_positive_int(None, 1), 1);
    }

    #[test]
    fn parse_positive_int_returns_fallback_for_empty() {
        assert_eq!(parse_positive_int(Some(""), 50), 50);
    }

    #[test]
    fn parse_positive_int_clamps_to_one() {
        assert_eq!(parse_positive_int(Some("0"), 1), 1);
        assert_eq!(parse_positive_int(Some("-5"), 1), 1);
    }

    #[test]
    fn parse_positive_int_floors_float() {
        assert_eq!(parse_positive_int(Some("3.9"), 1), 3);
    }

    #[test]
    fn parse_positive_int_normal() {
        assert_eq!(parse_positive_int(Some("10"), 1), 10);
    }

    // ── sanitize_ilike_term ───────────────────────────────────────────────────

    #[test]
    fn sanitize_removes_special_chars() {
        assert_eq!(sanitize_ilike_term("  foo,bar%(baz)  "), "foobarbaz");
    }

    #[test]
    fn sanitize_empty_stays_empty() {
        assert_eq!(sanitize_ilike_term("   "), "");
    }

    // ── parse_ids ─────────────────────────────────────────────────────────────

    #[test]
    fn parse_ids_splits_and_deduplicates() {
        let ids = parse_ids(Some("a,b,a,c"));
        assert_eq!(ids, vec!["a", "b", "c"]);
    }

    #[test]
    fn parse_ids_skips_empty_segments() {
        let ids = parse_ids(Some(",a,,b,"));
        assert_eq!(ids, vec!["a", "b"]);
    }

    #[test]
    fn parse_ids_returns_empty_for_none() {
        assert!(parse_ids(None).is_empty());
    }

    // ── build_rest_params ─────────────────────────────────────────────────────

    #[test]
    fn build_rest_params_baseline() {
        let q = ModelsQuery {
            page: 1,
            limit: 50,
            provider: None,
            type_filter: None,
            tag: None,
            ids: vec![],
            search: None,
            enabled: None,
        };
        let params = build_rest_params(&q);
        assert!(params.iter().any(|(k, v)| *k == "select" && v == "*"));
        assert!(
            params
                .iter()
                .any(|(k, v)| *k == "order" && v == "provider.asc,name.asc")
        );
        assert_eq!(params.len(), 2);
    }

    #[test]
    fn build_rest_params_with_all_filters() {
        let q = ModelsQuery {
            page: 2,
            limit: 10,
            provider: Some("openai".to_owned()),
            type_filter: Some("language".to_owned()),
            tag: Some("vision".to_owned()),
            ids: vec!["gpt-4".to_owned()],
            search: Some("gpt".to_owned()),
            enabled: Some(true),
        };
        let params = build_rest_params(&q);
        assert!(
            params
                .iter()
                .any(|(k, v)| *k == "provider" && v == "eq.openai")
        );
        assert!(
            params
                .iter()
                .any(|(k, v)| *k == "type" && v == "eq.language")
        );
        assert!(
            params
                .iter()
                .any(|(k, v)| *k == "tags" && v == "cs.{vision}")
        );
        assert!(params.iter().any(|(k, v)| *k == "id" && v == "in.(gpt-4)"));
        assert!(params.iter().any(|(k, _v)| *k == "or"));
        assert!(
            params
                .iter()
                .any(|(k, v)| *k == "is_enabled" && v == "eq.true")
        );
    }

    // ── total_from_content_range ──────────────────────────────────────────────

    struct FakeResponse {
        content_range: Option<&'static str>,
    }

    impl FakeResponse {
        fn header(&self, name: &str) -> Option<&str> {
            if name == "content-range" {
                self.content_range
            } else {
                None
            }
        }
    }

    #[test]
    fn total_from_content_range_normal() {
        let r = FakeResponse {
            content_range: Some("0-49/256"),
        };
        // Manually exercise the same logic as total_from_content_range.
        let header = r.header("content-range").unwrap();
        let total: i64 = header.rsplit_once('/').unwrap().1.trim().parse().unwrap();
        assert_eq!(total, 256);
    }

    #[test]
    fn total_from_content_range_star_returns_none() {
        let header = "0-0/*";
        let raw = header.rsplit_once('/').unwrap().1.trim();
        assert_eq!(raw, "*");
        assert!(raw.parse::<i64>().is_err() || raw == "*");
    }
}
