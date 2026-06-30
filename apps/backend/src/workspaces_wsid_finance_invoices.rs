//! Handler for `GET /api/v1/workspaces/:wsId/finance/invoices`.
//!
//! Ports the GET branch of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/finance/invoices/route.ts`.
//!
//! Auth + permissions: the legacy route resolves the finance route auth context
//! and requires the `view_invoices` workspace permission. This handler reuses
//! `finance_auth::authorize_finance_permission` for authentication,
//! workspace-id normalization, and the permission check, matching the legacy
//! status codes:
//!
//!   * missing/invalid session or unresolved workspace -> `401 Unauthorized`
//!   * authenticated caller lacking `view_invoices`    -> `403 Unauthorized`
//!   * invalid query parameters                        -> `400` with
//!     `{ "message": "Invalid query parameters" }`
//!   * upstream fetch failure or misconfiguration      -> `500` with
//!     `{ "message": "Error fetching invoices" }`
//!
//! Response: `{ "data": [...], "count": <total> }` (no-store).
//!
//! BEHAVIOR GAPS (items not reproduced in this Rust port):
//!
//!   * **Search path** (`q` non-empty): the secondary `finance_invoices` SELECT
//!     that enriches RPC results with creator and `wallet_transactions` info is
//!     skipped.  The raw RPC rows are returned as `data` (no
//!     `transformInvoiceSearchResults`).
//!   * **Non-search path**: `attachWalletNames`, `attachInvoiceCustomers`, and
//!     `transformInvoiceData` are not applied.  Raw PostgREST rows are returned.
//!   * `MAX_SEARCH_LENGTH` and `MAX_MEDIUM_TEXT_LENGTH` are approximated as
//!     `100` and `1000` respectively, mirroring sibling handler conventions.
//!     Verify against `@tuturuuu/utils/constants` when those values change.

use serde::Serialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    finance_auth::{FinanceAuthorization, FinanceAuthorizationError, authorize_finance_permission},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/finance/invoices";
const VIEW_INVOICES_PERMISSION: &str = "view_invoices";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_ERROR_MESSAGE: &str = "Error fetching invoices";
const SEARCH_ERROR_MESSAGE: &str = "Error searching invoices";
const INVALID_QUERY_MESSAGE: &str = "Invalid query parameters";

/// Mirrors `MAX_SEARCH_LENGTH` from `@tuturuuu/utils/constants`.
const MAX_SEARCH_LENGTH: usize = 100;

/// Mirrors `MAX_MEDIUM_TEXT_LENGTH` from `@tuturuuu/utils/constants`
/// (used as the upper bound for `pageSize`).
const MAX_PAGE_SIZE: i64 = 1000;

const DEFAULT_PAGE_SIZE: i64 = 10;

// ---------------------------------------------------------------------------
// Query parsing (mirrors the zod SearchParamsSchema)
// ---------------------------------------------------------------------------

struct InvoiceQuery {
    q: String,
    page: i64,
    page_size: i64,
    start: Option<String>,
    end: Option<String>,
    user_ids: Vec<String>,
    customer_ids: Vec<String>,
    wallet_ids: Vec<String>,
}

fn parse_invoice_query(url: Option<&str>) -> Option<InvoiceQuery> {
    let mut q = String::new();
    let mut page_raw: Option<String> = None;
    let mut page_size_raw: Option<String> = None;
    let mut start: Option<String> = None;
    let mut end: Option<String> = None;
    let mut user_ids: Vec<String> = Vec::new();
    let mut customer_ids: Vec<String> = Vec::new();
    let mut wallet_ids: Vec<String> = Vec::new();

    if let Some(parsed) = url.and_then(|u| url::Url::parse(u).ok()) {
        for (key, value) in parsed.query_pairs() {
            match key.as_ref() {
                "q" if q.is_empty() => q = value.into_owned(),
                "page" if page_raw.is_none() => page_raw = Some(value.into_owned()),
                "pageSize" if page_size_raw.is_none() => {
                    page_size_raw = Some(value.into_owned());
                }
                "start" if start.is_none() => start = Some(value.into_owned()),
                "end" if end.is_none() => end = Some(value.into_owned()),
                "userIds" => user_ids.push(value.into_owned()),
                "customerIds" => customer_ids.push(value.into_owned()),
                "walletIds" => wallet_ids.push(value.into_owned()),
                _ => {}
            }
        }
    }

    // Validate q length (zod: z.string().max(MAX_SEARCH_LENGTH)).
    if q.len() > MAX_SEARCH_LENGTH {
        return None;
    }

    // page: coerce to int, min 1 (zod default 1).
    let page = match page_raw.as_deref() {
        None => 1,
        Some(raw) => {
            let parsed: i64 = raw.trim().parse().ok()?;
            if parsed < 1 {
                return None;
            }
            parsed
        }
    };

    // pageSize: coerce to int, min 1, max MAX_PAGE_SIZE (zod default 10).
    let page_size = match page_size_raw.as_deref() {
        None => DEFAULT_PAGE_SIZE,
        Some(raw) => {
            let parsed: i64 = raw.trim().parse().ok()?;
            if !(1..=MAX_PAGE_SIZE).contains(&parsed) {
                return None;
            }
            parsed
        }
    };

    Some(InvoiceQuery {
        q,
        page,
        page_size,
        start,
        end,
        user_ids,
        customer_ids,
        wallet_ids,
    })
}

// ---------------------------------------------------------------------------
// RPC request body for the search path
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct SearchRpcRequest<'a> {
    p_ws_id: &'a str,
    p_search_query: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_start_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_end_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_user_ids: Option<&'a [String]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    p_wallet_ids: Option<&'a [String]>,
    p_limit: i64,
    p_offset: i64,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_finance_invoices_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = invoices_ws_id(request.path)?;

    Some(match request.method {
        "GET" => invoices_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn invoices_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let authorization = match authorize_finance_permission(
        config,
        request,
        raw_ws_id,
        VIEW_INVOICES_PERMISSION,
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
            return message_response(500, FETCH_ERROR_MESSAGE);
        }
    };

    let query = match parse_invoice_query(request.url) {
        Some(q) => q,
        None => return message_response(400, INVALID_QUERY_MESSAGE),
    };

    if !query.q.is_empty() {
        fetch_search(&config.contact_data, outbound, &authorization, &query).await
    } else {
        fetch_list(&config.contact_data, outbound, &authorization, &query).await
    }
}

// ---------------------------------------------------------------------------
// Search path: RPC `search_finance_invoices`
// ---------------------------------------------------------------------------

async fn fetch_search(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &InvoiceQuery,
) -> BackendResponse {
    let offset = (query.page - 1) * query.page_size;

    let body = match serde_json::to_string(&SearchRpcRequest {
        p_ws_id: &authorization.ws_id,
        p_search_query: &query.q,
        p_start_date: query.start.as_deref(),
        p_end_date: query.end.as_deref(),
        p_user_ids: optional_slice(&query.user_ids),
        p_wallet_ids: optional_slice(&query.wallet_ids),
        p_limit: query.page_size,
        p_offset: offset,
    }) {
        Ok(b) => b,
        Err(_) => return message_response(500, SEARCH_ERROR_MESSAGE),
    };

    let rpc_url = match contact_data.rpc_url("search_finance_invoices") {
        Some(u) => u,
        None => return message_response(500, SEARCH_ERROR_MESSAGE),
    };
    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return message_response(500, SEARCH_ERROR_MESSAGE),
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return message_response(500, SEARCH_ERROR_MESSAGE),
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, SEARCH_ERROR_MESSAGE);
    }

    let rows: Vec<Value> = match response.json::<Option<Vec<Value>>>() {
        Ok(Some(rows)) => rows,
        Ok(None) => Vec::new(),
        Err(_) => return message_response(500, SEARCH_ERROR_MESSAGE),
    };

    // Extract total_count from the first row (all rows carry the same value).
    // Mirrors: `searchResults?.[0]?.total_count || 0`.
    let count: i64 = rows
        .first()
        .and_then(|row| row.get("total_count"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    no_store_response(json_response(200, json!({ "data": rows, "count": count })))
}

// ---------------------------------------------------------------------------
// Non-search path: REST `finance_invoices`
// ---------------------------------------------------------------------------

async fn fetch_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    authorization: &FinanceAuthorization,
    query: &InvoiceQuery,
) -> BackendResponse {
    let ws_id = &authorization.ws_id;
    let offset = (query.page - 1) * query.page_size;

    // Mirror the legacy `selectQuery` construction, including the optional
    // `!inner` join when walletIds filter is active.
    let wallet_join = if query.wallet_ids.is_empty() {
        "wallet_transactions!finance_invoices_transaction_id_fkey(wallet_id)"
    } else {
        "wallet_transactions!finance_invoices_transaction_id_fkey!inner(wallet_id)"
    };
    let select = format!(
        "*,\
         legacy_creator:workspace_users!finance_invoices_creator_id_fkey\
             (id,full_name,display_name,email,avatar_url),\
         platform_creator:users!finance_invoices_platform_creator_id_fkey\
             (id,display_name,avatar_url,user_private_details(full_name,email)),\
         {wallet_join}"
    );

    let mut params: Vec<(&str, String)> = vec![
        ("select", select),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
        ("limit", query.page_size.to_string()),
        ("offset", offset.to_string()),
    ];

    if let Some(start) = query.start.as_deref() {
        params.push(("created_at", format!("gte.{start}")));
    }
    if let Some(end) = query.end.as_deref() {
        params.push(("created_at", format!("lte.{end}")));
    }
    if !query.user_ids.is_empty() {
        params.push(("creator_id", format!("in.({})", query.user_ids.join(","))));
    }
    if !query.customer_ids.is_empty() {
        params.push((
            "customer_id",
            format!("in.({})", query.customer_ids.join(",")),
        ));
    }
    if !query.wallet_ids.is_empty() {
        params.push((
            "wallet_transactions.wallet_id",
            format!("in.({})", query.wallet_ids.join(",")),
        ));
    }

    let url = match contact_data.rest_url("finance_invoices", &params) {
        Some(u) => u,
        None => return message_response(500, FETCH_ERROR_MESSAGE),
    };
    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return message_response(500, FETCH_ERROR_MESSAGE),
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                // Request exact total count; PostgREST returns it in Content-Range.
                .with_header("Prefer", "count=exact"),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, FETCH_ERROR_MESSAGE);
    }

    // PostgREST sets `Content-Range: <start>-<end>/<total>` (or `*/<total>`
    // when the result set is empty).  Mirror legacy `count ?? 0`.
    let count: i64 = response
        .header("Content-Range")
        .and_then(|h| h.split('/').nth(1))
        .and_then(|s| s.trim().parse::<i64>().ok())
        .unwrap_or(0);

    let data: Vec<Value> = match response.json::<Option<Vec<Value>>>() {
        Ok(Some(rows)) => rows,
        Ok(None) => Vec::new(),
        Err(_) => return message_response(500, FETCH_ERROR_MESSAGE),
    };

    no_store_response(json_response(200, json!({ "data": data, "count": count })))
}

// ---------------------------------------------------------------------------
// Path + response helpers
// ---------------------------------------------------------------------------

fn invoices_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    // Guard: ws_id must be non-empty and must not contain '/' (which would
    // indicate a deeper path like /finance/invoices/count that has its own
    // handler).
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn optional_slice(values: &[String]) -> Option<&[String]> {
    // Mirrors legacy `ids.length > 0 ? ids : undefined`.
    (!values.is_empty()).then_some(values)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- invoices_ws_id ---

    #[test]
    fn invoices_ws_id_extracts_uuid_segment() {
        assert_eq!(
            invoices_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000001/finance/invoices"
            ),
            Some("00000000-0000-0000-0000-000000000001")
        );
    }

    #[test]
    fn invoices_ws_id_rejects_child_path() {
        // /finance/invoices/count has its own handler; must not match here.
        assert_eq!(
            invoices_ws_id("/api/v1/workspaces/abc-123/finance/invoices/count"),
            None
        );
    }

    #[test]
    fn invoices_ws_id_rejects_wrong_suffix() {
        assert_eq!(
            invoices_ws_id("/api/v1/workspaces/abc-123/finance/other"),
            None
        );
    }

    #[test]
    fn invoices_ws_id_rejects_empty_ws_id() {
        assert_eq!(invoices_ws_id("/api/v1/workspaces//finance/invoices"), None);
    }

    // --- parse_invoice_query ---

    #[test]
    fn parse_invoice_query_defaults() {
        let q = parse_invoice_query(Some("http://localhost/")).unwrap();
        assert_eq!(q.q, "");
        assert_eq!(q.page, 1);
        assert_eq!(q.page_size, DEFAULT_PAGE_SIZE);
        assert!(q.start.is_none());
        assert!(q.end.is_none());
        assert!(q.user_ids.is_empty());
        assert!(q.customer_ids.is_empty());
        assert!(q.wallet_ids.is_empty());
    }

    #[test]
    fn parse_invoice_query_with_all_params() {
        let q = parse_invoice_query(Some(
            "http://localhost/?q=test&page=2&pageSize=5\
             &start=2024-01-01&end=2024-12-31\
             &userIds=u1&userIds=u2\
             &customerIds=c1\
             &walletIds=w1&walletIds=w2",
        ))
        .unwrap();
        assert_eq!(q.q, "test");
        assert_eq!(q.page, 2);
        assert_eq!(q.page_size, 5);
        assert_eq!(q.start.as_deref(), Some("2024-01-01"));
        assert_eq!(q.end.as_deref(), Some("2024-12-31"));
        assert_eq!(q.user_ids, vec!["u1".to_owned(), "u2".to_owned()]);
        assert_eq!(q.customer_ids, vec!["c1".to_owned()]);
        assert_eq!(q.wallet_ids, vec!["w1".to_owned(), "w2".to_owned()]);
    }

    #[test]
    fn parse_invoice_query_page_zero_rejected() {
        assert!(parse_invoice_query(Some("http://localhost/?page=0")).is_none());
    }

    #[test]
    fn parse_invoice_query_page_size_zero_rejected() {
        assert!(parse_invoice_query(Some("http://localhost/?pageSize=0")).is_none());
    }

    #[test]
    fn parse_invoice_query_page_size_over_max_rejected() {
        let over = (MAX_PAGE_SIZE + 1).to_string();
        assert!(parse_invoice_query(Some(&format!("http://localhost/?pageSize={over}"))).is_none());
    }

    #[test]
    fn parse_invoice_query_max_page_size_accepted() {
        let q = parse_invoice_query(Some(&format!("http://localhost/?pageSize={MAX_PAGE_SIZE}")))
            .unwrap();
        assert_eq!(q.page_size, MAX_PAGE_SIZE);
    }

    // --- optional_slice ---

    #[test]
    fn optional_slice_empty_is_none() {
        let empty: Vec<String> = vec![];
        assert!(optional_slice(&empty).is_none());
    }

    #[test]
    fn optional_slice_nonempty_is_some() {
        let values = vec!["a".to_owned()];
        assert_eq!(optional_slice(&values), Some(values.as_slice()));
    }
}
