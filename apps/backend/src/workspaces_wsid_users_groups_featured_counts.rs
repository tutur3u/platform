//! Handler for `GET /api/v1/workspaces/:wsId/users/groups/featured-counts`.
//!
//! Ports the legacy Next.js GET handler at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/users/groups/featured-counts/route.ts`.
//!
//! ## What the legacy route does (GET path)
//!
//!   1. Parses query params: `featuredGroupIds`, `excludedGroups`, `linkStatus`,
//!      `q`, `searchQuery`, and `status` — accepting multi-valued and
//!      comma-separated forms for the list params.
//!   2. Calls `getPermissions({ wsId, request })` — any authenticated workspace
//!      member satisfies this; returns `404 { "error": "Not found" }` when the
//!      workspace does not exist or the caller is not a member.
//!   3. Returns `{}` immediately when `featuredGroupIds` is empty.
//!   4. Calls the Supabase RPC `get_featured_group_counts` (admin/service-role)
//!      with `_ws_id`, `_featured_group_ids`, `_excluded_groups`,
//!      `_search_query`, `_status`, and `_link_status`.
//!   5. On a 502 / gateway HTML error from Supabase, returns a zeroed map
//!      `{ "<groupId>": 0, … }` as a graceful fallback.
//!   6. On any other error, returns `500 { "message": "Error fetching featured
//!      group counts" }`.
//!   7. On success, returns `{ "<group_id>": <user_count>, … }`.
//!
//! ## Behavior gaps vs legacy
//!
//!   * **Auth status codes** — The legacy route returns `404 { "error": "Not
//!     found" }` for unauthenticated callers and non-members. This handler uses
//!     `authorize_finance_permission` with `"view_members"`, so it returns `401`
//!     for missing/invalid sessions and `403` for authenticated callers who lack
//!     `view_members`. Workspace creators and holders of the `admin` permission
//!     satisfy every permission check and are unaffected.
//!   * **POST method** — The legacy route also handles POST (body replaces query
//!     params). This handler returns `None` for all non-GET methods so the
//!     still-live Next.js route handles POST/PUT/PATCH/DELETE.
//!   * **Request log drain** — not reproduced (worker-side concern).
//!   * **Query param coercion errors (400)** — the legacy route uses zod and
//!     returns `400` on validation failure. This handler uses permissive parsing
//!     (falls back to defaults), so it never emits a `400`.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse,
    finance_auth::{FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/groups/featured-counts";
const VIEW_MEMBERS_PERMISSION: &str = "view_members";
const GET_FEATURED_GROUP_COUNTS_RPC: &str = "get_featured_group_counts";
const ERROR_MESSAGE: &str = "Error fetching featured group counts";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const DEFAULT_STATUS: &str = "active";
const DEFAULT_LINK_STATUS: &str = "all";

/// A single row returned by the `get_featured_group_counts` RPC.
#[derive(Deserialize)]
struct FeaturedGroupCountRow {
    group_id: Option<String>,
    user_count: Option<Value>,
}

pub(crate) async fn handle_workspaces_wsid_users_groups_featured_counts_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = featured_counts_ws_id(request.path)?;

    Some(match request.method {
        "GET" => featured_counts_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn featured_counts_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_MEMBERS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(FinanceAuthorizationError::Unauthorized | FinanceAuthorizationError::NotFound) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Forbidden) => {
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(FinanceAuthorizationError::Internal) => {
            return error_response();
        }
    };

    let parsed = parse_query_params(request.url);

    // Mirror the legacy early-return for empty featuredGroupIds.
    if parsed.featured_group_ids.is_empty() {
        return no_store_response(json_response(200, json!({})));
    }

    let contact_data = &config.contact_data;

    let rpc_url = match contact_data.rpc_url(GET_FEATURED_GROUP_COUNTS_RPC) {
        Some(url) => url,
        None => return error_response(),
    };
    let service_role_key = match contact_data.service_role_key() {
        Some(key) => key,
        None => return error_response(),
    };
    let bearer = format!("Bearer {service_role_key}");

    let search_query: Value = parsed
        .search_query
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| Value::String(s.to_owned()))
        .unwrap_or(Value::Null);

    let body = json!({
        "_ws_id": authorization.ws_id,
        "_featured_group_ids": parsed.featured_group_ids,
        "_excluded_groups": parsed.excluded_groups,
        "_search_query": search_query,
        "_status": parsed.status,
        "_link_status": parsed.link_status,
    });
    let body_str = body.to_string();

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body_str),
        )
        .await
    {
        Ok(resp) => resp,
        Err(_) => return error_response(),
    };

    // Mirror the legacy 502 graceful fallback: return zeros for every featured
    // group when Supabase returns a gateway error HTML page.
    if response.status == 502 {
        let zeros = zeros_map(&parsed.featured_group_ids);
        return no_store_response(json_response(200, zeros));
    }

    if !(200..300).contains(&response.status) {
        return error_response();
    }

    let rows = match response.json::<Vec<FeaturedGroupCountRow>>() {
        Ok(rows) => rows,
        Err(_) => return error_response(),
    };

    let mut counts: Map<String, Value> = Map::new();
    for row in rows {
        if let Some(group_id) = row.group_id {
            let count = row.user_count.as_ref().and_then(value_as_i64).unwrap_or(0);
            counts.insert(group_id, Value::from(count));
        }
    }

    no_store_response(json_response(200, Value::Object(counts)))
}

// ---------------------------------------------------------------------------
// Query-param parsing
// ---------------------------------------------------------------------------

struct ParsedQueryParams {
    featured_group_ids: Vec<String>,
    excluded_groups: Vec<String>,
    link_status: String,
    search_query: Option<String>,
    status: String,
}

/// Collects all values for a given query key (multi-valued support) and also
/// splits each value by comma, matching the legacy `normalizeListParam` logic.
fn collect_list_param(url: Option<&url::Url>, key: &str) -> Vec<String> {
    let Some(url) = url else {
        return Vec::new();
    };
    url.query_pairs()
        .filter_map(|(name, value)| {
            if name == key {
                Some(value.into_owned())
            } else {
                None
            }
        })
        .flat_map(|entry| {
            entry
                .split(',')
                .map(|s| s.trim().to_owned())
                .collect::<Vec<_>>()
        })
        .filter(|s| !s.is_empty())
        .collect()
}

fn optional_str_param(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(name, value)| {
            if name == key {
                Some(value.into_owned())
            } else {
                None
            }
        })
        .filter(|s| !s.is_empty())
}

fn str_param_or(url: Option<&url::Url>, key: &str, default: &str) -> String {
    optional_str_param(url, key).unwrap_or_else(|| default.to_owned())
}

fn parse_query_params(raw_url: Option<&str>) -> ParsedQueryParams {
    let url = raw_url.and_then(|u| url::Url::parse(u).ok());
    let url = url.as_ref();

    let featured_group_ids = collect_list_param(url, "featuredGroupIds");
    let excluded_groups = collect_list_param(url, "excludedGroups");
    let link_status = str_param_or(url, "linkStatus", DEFAULT_LINK_STATUS);
    let status = str_param_or(url, "status", DEFAULT_STATUS);

    // Legacy: `searchQuery || q || undefined`
    let search_query =
        optional_str_param(url, "searchQuery").or_else(|| optional_str_param(url, "q"));

    ParsedQueryParams {
        featured_group_ids,
        excluded_groups,
        link_status,
        search_query,
        status,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Converts a JSON `Value` to an `i64`, mirroring the legacy `Number(row.user_count)`.
fn value_as_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(s) => s.trim().parse::<i64>().ok(),
        _ => None,
    }
}

/// Builds a zeroed-out counts map — used for the 502 gateway fallback.
fn zeros_map(group_ids: &[String]) -> Value {
    let map: Map<String, Value> = group_ids
        .iter()
        .map(|id| (id.clone(), Value::from(0i64)))
        .collect();
    Value::Object(map)
}

fn featured_counts_ws_id(path: &str) -> Option<&str> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    let ws_id = rest.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response() -> BackendResponse {
    message_response(500, ERROR_MESSAGE)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- Path extraction ------------------------------------------------------

    #[test]
    fn extracts_ws_id_from_valid_path() {
        assert_eq!(
            featured_counts_ws_id("/api/v1/workspaces/abc-123/users/groups/featured-counts"),
            Some("abc-123")
        );
    }

    #[test]
    fn rejects_path_without_prefix() {
        assert_eq!(
            featured_counts_ws_id("/api/v1/workspaces/abc/users/groups/other"),
            None
        );
    }

    #[test]
    fn rejects_path_with_trailing_slash_segment() {
        // A path with an extra segment in the ws_id position must not match.
        assert_eq!(
            featured_counts_ws_id("/api/v1/workspaces/a/b/users/groups/featured-counts"),
            None
        );
    }

    #[test]
    fn rejects_empty_ws_id() {
        assert_eq!(
            featured_counts_ws_id("/api/v1/workspaces//users/groups/featured-counts"),
            None
        );
    }

    // -- Query-param parsing --------------------------------------------------

    #[test]
    fn parses_single_featured_group_id() {
        let params = parse_query_params(Some("https://example.com/path?featuredGroupIds=g1"));
        assert_eq!(params.featured_group_ids, vec!["g1"]);
        assert!(params.excluded_groups.is_empty());
        assert_eq!(params.status, DEFAULT_STATUS);
        assert_eq!(params.link_status, DEFAULT_LINK_STATUS);
        assert!(params.search_query.is_none());
    }

    #[test]
    fn parses_comma_separated_featured_group_ids() {
        let params = parse_query_params(Some(
            "https://example.com/path?featuredGroupIds=g1%2Cg2%2Cg3",
        ));
        assert_eq!(params.featured_group_ids, vec!["g1", "g2", "g3"]);
    }

    #[test]
    fn parses_multi_valued_featured_group_ids() {
        let params = parse_query_params(Some(
            "https://example.com/path?featuredGroupIds=g1&featuredGroupIds=g2",
        ));
        assert_eq!(params.featured_group_ids, vec!["g1", "g2"]);
    }

    #[test]
    fn returns_empty_vec_for_absent_list_params() {
        let params = parse_query_params(Some("https://example.com/path?status=inactive"));
        assert!(params.featured_group_ids.is_empty());
        assert!(params.excluded_groups.is_empty());
    }

    #[test]
    fn prefers_search_query_over_q() {
        let params = parse_query_params(Some("https://example.com/path?searchQuery=hello&q=world"));
        assert_eq!(params.search_query.as_deref(), Some("hello"));
    }

    #[test]
    fn falls_back_to_q_when_no_search_query() {
        let params = parse_query_params(Some("https://example.com/path?q=world"));
        assert_eq!(params.search_query.as_deref(), Some("world"));
    }

    #[test]
    fn applies_defaults_when_params_absent() {
        let params = parse_query_params(Some("https://example.com/path"));
        assert_eq!(params.status, DEFAULT_STATUS);
        assert_eq!(params.link_status, DEFAULT_LINK_STATUS);
    }

    // -- zeros_map ------------------------------------------------------------

    #[test]
    fn zeros_map_produces_zeroed_entries() {
        let ids = vec!["g1".to_owned(), "g2".to_owned()];
        let map = zeros_map(&ids);
        let Value::Object(obj) = map else {
            panic!("expected object");
        };
        assert_eq!(obj["g1"], Value::from(0i64));
        assert_eq!(obj["g2"], Value::from(0i64));
    }

    #[test]
    fn zeros_map_empty_input() {
        let map = zeros_map(&[]);
        let Value::Object(obj) = map else {
            panic!("expected object");
        };
        assert!(obj.is_empty());
    }

    // -- value_as_i64 ---------------------------------------------------------

    #[test]
    fn converts_json_number_to_i64() {
        assert_eq!(value_as_i64(&json!(42)), Some(42));
    }

    #[test]
    fn converts_json_string_number_to_i64() {
        assert_eq!(value_as_i64(&json!("7")), Some(7));
    }

    #[test]
    fn returns_none_for_null() {
        assert_eq!(value_as_i64(&Value::Null), None);
    }
}
