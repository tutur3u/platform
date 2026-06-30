//! Handler for `GET /api/v1/workspaces/:wsId/datasets/:datasetId/rows`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/datasets/[datasetId]/rows/route.ts`.
//!
//! Only the `GET` method is migrated. `POST`, `PUT`, and `DELETE` are left to
//! the still-active Next.js route; this handler returns `None` for every
//! non-`GET` request so the worker falls through.
//!
//! ## Auth
//!
//! The legacy route uses `createClient()` (an authenticated session client)
//! with RLS active. This handler mirrors that by requiring a valid Supabase
//! session token and forwarding it to PostgREST as the caller's bearer, with
//! the service-role key supplied only as the `apikey` (RLS remains active).
//!
//! ## Response shape
//!
//! ```json
//! { "data": [...], "totalRows": N, "page": P, "pageSize": S }
//! ```
//!
//! `page` defaults to 1, `pageSize` defaults to 10.
//!
//! ## Behavior gaps
//!
//! - The total count is obtained via a separate `select=count()` request to
//!   `workspace_dataset_rows` rather than a HEAD request (which `OutboundMethod`
//!   does not support). The result is semantically identical.
//! - Row data is fetched from `workspace_dataset_row_cells` using `Range`
//!   headers instead of Supabase JS `.range(start, end)`. The result is the
//!   same paginated slice.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Failed to fetch rows";
const DEFAULT_PAGE: i64 = 1;
const DEFAULT_PAGE_SIZE: i64 = 10;

#[derive(Deserialize)]
struct CountRow {
    count: Option<i64>,
}

/// Handles `GET /api/v1/workspaces/:wsId/datasets/:datasetId/rows`.
///
/// Returns `None` when the path does not match, so the worker dispatcher can
/// continue. Returns `Some(response)` only for the migrated `GET` method.
pub(crate) async fn handle_workspaces_wsid_datasets_datasetid_rows_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (_ws_id, dataset_id) = rows_segments(request.path)?;

    Some(match request.method {
        "GET" => dataset_rows_response(config, request, dataset_id, outbound).await,
        // POST/PUT/DELETE are not migrated; fall through to Next.js.
        _ => return None,
    })
}

async fn dataset_rows_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    dataset_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let parsed_url = request.url.and_then(|u| url::Url::parse(u).ok());
    let page = parse_positive_i64(query_param(parsed_url.as_ref(), "page"), DEFAULT_PAGE);
    let page_size = parse_positive_i64(
        query_param(parsed_url.as_ref(), "pageSize"),
        DEFAULT_PAGE_SIZE,
    );

    let start = (page - 1) * page_size;
    let end = start + page_size - 1;

    // Fetch total count from workspace_dataset_rows.
    let total_rows =
        match fetch_row_count(&config.contact_data, outbound, dataset_id, &access_token).await {
            Ok(n) => n,
            Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
        };

    // Fetch paginated row data from workspace_dataset_row_cells view.
    let rows = match fetch_row_cells(
        &config.contact_data,
        outbound,
        dataset_id,
        &access_token,
        start,
        end,
    )
    .await
    {
        Ok(data) => data,
        Err(()) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": rows,
            "totalRows": total_rows,
            "page": page,
            "pageSize": page_size,
        }),
    ))
}

/// Queries `workspace_dataset_rows` with `select=count()` to mirror the legacy
/// `{ count: 'exact', head: true }` Supabase JS call. Returns the count or 0.
async fn fetch_row_count(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    dataset_id: &str,
    access_token: &str,
) -> Result<i64, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_dataset_rows",
        &[
            ("select", "count()".to_owned()),
            ("dataset_id", format!("eq.{dataset_id}")),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

    // PostgREST returns `[{ "count": N }]` for aggregate selects.
    Ok(response
        .json::<Vec<CountRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.count)
        .unwrap_or(0))
}

/// Queries `workspace_dataset_row_cells` for the paginated slice, using
/// `Range: start-end` headers to mirror the legacy `.range(start, end)` call.
async fn fetch_row_cells(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    dataset_id: &str,
    access_token: &str,
    start: i64,
    end: i64,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_dataset_row_cells",
        &[
            ("select", "*".to_owned()),
            ("dataset_id", format!("eq.{dataset_id}")),
            ("order", "row_id.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let range_header = format!("{start}-{end}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range_header),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

/// Extracts `(:wsId, :datasetId)` from
/// `/api/v1/workspaces/:wsId/datasets/:datasetId/rows`.
fn rows_segments(path: &str) -> Option<(&str, &str)> {
    let path = path.split('?').next().unwrap_or(path);
    let segments: Vec<&str> = path
        .trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .collect();

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "datasets"
        && !segments[5].is_empty()
        && segments[6] == "rows"
    {
        Some((segments[3], segments[5]))
    } else {
        None
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Returns the first query-string value for `key`, or `None`.
fn query_param(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

/// Parses an integer from `s` and clamps it to at least 1. Falls back to
/// `default` when `s` is `None` or cannot be parsed.
fn parse_positive_i64(s: Option<String>, default: i64) -> i64 {
    s.as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(default)
        .max(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── rows_segments ─────────────────────────────────────────────────────────

    #[test]
    fn segments_matches_exact_path() {
        let result = rows_segments("/api/v1/workspaces/ws-abc/datasets/ds-123/rows");
        assert_eq!(result, Some(("ws-abc", "ds-123")));
    }

    #[test]
    fn segments_strips_query_string() {
        let result =
            rows_segments("/api/v1/workspaces/ws-abc/datasets/ds-123/rows?page=2&pageSize=5");
        assert_eq!(result, Some(("ws-abc", "ds-123")));
    }

    #[test]
    fn segments_strips_trailing_slash() {
        let result = rows_segments("/api/v1/workspaces/ws-abc/datasets/ds-123/rows/");
        assert_eq!(result, Some(("ws-abc", "ds-123")));
    }

    #[test]
    fn segments_rejects_wrong_suffix() {
        assert!(rows_segments("/api/v1/workspaces/ws-abc/datasets/ds-123/cells").is_none());
    }

    #[test]
    fn segments_rejects_too_short() {
        assert!(rows_segments("/api/v1/workspaces/ws-abc/datasets/rows").is_none());
    }

    #[test]
    fn segments_rejects_empty_ws_id() {
        assert!(rows_segments("/api/v1/workspaces//datasets/ds-123/rows").is_none());
    }

    #[test]
    fn segments_rejects_empty_dataset_id() {
        assert!(rows_segments("/api/v1/workspaces/ws-abc/datasets//rows").is_none());
    }

    // ── parse_positive_i64 ────────────────────────────────────────────────────

    #[test]
    fn parse_positive_i64_uses_default_on_none() {
        assert_eq!(parse_positive_i64(None, DEFAULT_PAGE), DEFAULT_PAGE);
    }

    #[test]
    fn parse_positive_i64_parses_valid_value() {
        assert_eq!(parse_positive_i64(Some("3".to_owned()), DEFAULT_PAGE), 3);
    }

    #[test]
    fn parse_positive_i64_clamps_zero_to_one() {
        assert_eq!(parse_positive_i64(Some("0".to_owned()), DEFAULT_PAGE), 1);
    }

    #[test]
    fn parse_positive_i64_clamps_negative_to_one() {
        assert_eq!(parse_positive_i64(Some("-5".to_owned()), DEFAULT_PAGE), 1);
    }

    #[test]
    fn parse_positive_i64_falls_back_on_non_numeric() {
        assert_eq!(
            parse_positive_i64(Some("abc".to_owned()), DEFAULT_PAGE),
            DEFAULT_PAGE
        );
    }

    // ── query_param ───────────────────────────────────────────────────────────

    #[test]
    fn query_param_returns_none_when_url_is_none() {
        assert_eq!(query_param(None, "page"), None);
    }

    #[test]
    fn query_param_returns_value_when_present() {
        let url = url::Url::parse("https://example.com/path?page=2&pageSize=20").unwrap();
        assert_eq!(query_param(Some(&url), "page"), Some("2".to_owned()));
        assert_eq!(query_param(Some(&url), "pageSize"), Some("20".to_owned()));
    }

    #[test]
    fn query_param_returns_none_when_key_absent() {
        let url = url::Url::parse("https://example.com/path?page=1").unwrap();
        assert_eq!(query_param(Some(&url), "pageSize"), None);
    }

    // ── pagination arithmetic ─────────────────────────────────────────────────

    #[test]
    fn page_one_starts_at_zero() {
        let page: i64 = 1;
        let page_size: i64 = 10;
        let start = (page - 1) * page_size;
        let end = start + page_size - 1;
        assert_eq!(start, 0);
        assert_eq!(end, 9);
    }

    #[test]
    fn page_two_starts_at_page_size() {
        let page: i64 = 2;
        let page_size: i64 = 10;
        let start = (page - 1) * page_size;
        let end = start + page_size - 1;
        assert_eq!(start, 10);
        assert_eq!(end, 19);
    }
}
