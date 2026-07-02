//! Handler for `GET /api/v1/workspaces/:wsId/documents`.
//!
//! Ports the GET handler from the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/documents/route.ts`.
//!
//! Auth model: workspace session auth with the `manage_documents` permission,
//! checked via `workspace_permission_check::authorize_workspace_permission`.
//!
//! Query parameters:
//!
//! - `search` — optional substring filter on `name` (case-insensitive ilike)
//! - `limit` — integer 1–100, default 50
//! - `offset` — integer >= 0, default 0
//!
//! Response shape (200):
//!
//! ```json
//! {
//!   "data": [{ "id", "name", "content", "is_public", "created_at" }, ...],
//!   "pagination": { "limit", "offset", "filteredTotal" }
//! }
//! ```
//!
//! Status codes mirror the legacy route:
//!
//! - unauthenticated / unresolvable workspace -> `401`
//! - authenticated, lacks `manage_documents`  -> `403`
//! - configuration or upstream failure        -> `500`
//! - success                                  -> `200`
//!
//! `POST` and all other methods return `None`; the still-live Next.js route
//! handles them.
//!
//! BEHAVIOR GAPS vs. legacy:
//!
//! - The legacy route reads documents with the Supabase admin (service-role)
//!   client. This handler also uses the service-role key after verifying the
//!   caller's `manage_documents` permission independently.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const DOCUMENTS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const DOCUMENTS_PATH_SUFFIX: &str = "/documents";
const MANAGE_DOCUMENTS_PERMISSION: &str = "manage_documents";
const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 100;

#[derive(Deserialize)]
struct DocumentRow {
    id: Option<String>,
    name: Option<String>,
    content: Option<Value>,
    is_public: Option<bool>,
    created_at: Option<String>,
}

struct DocumentsQuery {
    search: Option<String>,
    limit: i64,
    offset: i64,
}

pub(crate) async fn handle_workspaces_wsid_documents_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = documents_ws_id_from_path(request.path)?;

    Some(match request.method {
        "GET" => get_documents_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn get_documents_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return message_response(500, "Error listing documents");
    }

    let authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_DOCUMENTS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(auth) => auth,
        Err(
            WorkspacePermissionAuthorizationError::Unauthorized
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(401, "Unauthorized");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, "Forbidden");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, "Error listing documents");
        }
    };

    let query = documents_query_from_url(request.url);

    match fetch_documents(&config.contact_data, outbound, &authorization.ws_id, &query).await {
        Ok((rows, filtered_total)) => {
            let data = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.id,
                        "name": row.name,
                        "content": row.content,
                        "is_public": row.is_public,
                        "created_at": row.created_at,
                    })
                })
                .collect::<Vec<_>>();

            no_store_response(json_response(
                200,
                json!({
                    "data": data,
                    "pagination": {
                        "limit": query.limit,
                        "offset": query.offset,
                        "filteredTotal": filtered_total,
                    },
                }),
            ))
        }
        Err(()) => message_response(500, "Error listing documents"),
    }
}

async fn fetch_documents(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &DocumentsQuery,
) -> Result<(Vec<DocumentRow>, i64), ()> {
    let mut params = vec![
        ("select", "id,name,content,is_public,created_at".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];

    if let Some(search) = &query.search {
        params.push(("name", format!("ilike.%{search}%")));
    }

    let url = contact_data
        .rest_url("workspace_documents", &params)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    let range = format!("{}-{}", query.offset, query.offset + query.limit - 1);

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range)
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let filtered_total = filtered_total_from_response(&response);
    let rows = response.json::<Vec<DocumentRow>>().map_err(|_| ())?;

    Ok((rows, filtered_total))
}

/// Extract the total count from the PostgREST `Content-Range` response header.
///
/// PostgREST returns a header like `Content-Range: 0-49/237` when
/// `Prefer: count=exact` is set. This parses the denominator.
fn filtered_total_from_response(response: &crate::outbound::OutboundResponse) -> i64 {
    response
        .header("content-range")
        .and_then(|v| v.split('/').nth(1))
        .and_then(|n| n.trim().parse::<i64>().ok())
        .unwrap_or(0)
}

fn documents_query_from_url(request_url: Option<&str>) -> DocumentsQuery {
    let mut query = DocumentsQuery {
        search: None,
        limit: DEFAULT_LIMIT,
        offset: 0,
    };
    let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
        return query;
    };
    let mut saw_limit = false;
    let mut saw_offset = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "search" if query.search.is_none() => {
                let trimmed = value.trim().to_owned();
                if !trimmed.is_empty() {
                    query.search = Some(trimmed);
                }
            }
            "limit" if !saw_limit => {
                if let Ok(n) = value.parse::<i64>() {
                    query.limit = n.clamp(1, MAX_LIMIT);
                }
                saw_limit = true;
            }
            "offset" if !saw_offset => {
                if let Ok(n) = value.parse::<i64>() {
                    query.offset = n.max(0);
                }
                saw_offset = true;
            }
            _ => {}
        }
    }

    query
}

fn documents_ws_id_from_path(path: &str) -> Option<&str> {
    let after_prefix = path.strip_prefix(DOCUMENTS_PATH_PREFIX)?;
    let ws_id = after_prefix.strip_suffix(DOCUMENTS_PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- path extraction ---

    #[test]
    fn extracts_ws_id_from_valid_path() {
        assert_eq!(
            documents_ws_id_from_path("/api/v1/workspaces/ws-123/documents"),
            Some("ws-123")
        );
    }

    #[test]
    fn extracts_uuid_ws_id() {
        let uuid = "00000000-0000-0000-0000-000000000001";
        let path = format!("/api/v1/workspaces/{uuid}/documents");
        assert_eq!(documents_ws_id_from_path(&path), Some(uuid));
    }

    #[test]
    fn rejects_path_with_extra_segment() {
        assert!(documents_ws_id_from_path("/api/v1/workspaces/ws-1/documents/extra").is_none());
    }

    #[test]
    fn rejects_unrelated_path() {
        assert!(documents_ws_id_from_path("/api/v1/documents").is_none());
    }

    #[test]
    fn rejects_empty_ws_id() {
        assert!(documents_ws_id_from_path("/api/v1/workspaces//documents").is_none());
    }

    // --- query parsing ---

    #[test]
    fn query_defaults_when_no_params() {
        let q =
            documents_query_from_url(Some("https://example.com/api/v1/workspaces/ws-1/documents"));
        assert_eq!(q.limit, DEFAULT_LIMIT);
        assert_eq!(q.offset, 0);
        assert!(q.search.is_none());
    }

    #[test]
    fn query_parses_all_params() {
        let q = documents_query_from_url(Some(
            "https://example.com/api/v1/workspaces/ws-1/documents\
             ?search=hello&limit=10&offset=20",
        ));
        assert_eq!(q.search.as_deref(), Some("hello"));
        assert_eq!(q.limit, 10);
        assert_eq!(q.offset, 20);
    }

    #[test]
    fn query_clamps_limit_above_max() {
        let q = documents_query_from_url(Some(
            "https://example.com/api/v1/workspaces/ws-1/documents?limit=999",
        ));
        assert_eq!(q.limit, MAX_LIMIT);
    }

    #[test]
    fn query_clamps_limit_zero_to_one() {
        let q = documents_query_from_url(Some(
            "https://example.com/api/v1/workspaces/ws-1/documents?limit=0",
        ));
        assert_eq!(q.limit, 1);
    }

    #[test]
    fn query_clamps_negative_offset_to_zero() {
        let q = documents_query_from_url(Some(
            "https://example.com/api/v1/workspaces/ws-1/documents?offset=-5",
        ));
        assert_eq!(q.offset, 0);
    }

    #[test]
    fn query_ignores_empty_search() {
        let q = documents_query_from_url(Some(
            "https://example.com/api/v1/workspaces/ws-1/documents?search=",
        ));
        assert!(q.search.is_none());
    }

    #[test]
    fn query_trims_whitespace_from_search() {
        let q = documents_query_from_url(Some(
            "https://example.com/api/v1/workspaces/ws-1/documents?search=%20hello%20",
        ));
        assert_eq!(q.search.as_deref(), Some("hello"));
    }

    #[test]
    fn query_defaults_on_none_url() {
        let q = documents_query_from_url(None);
        assert_eq!(q.limit, DEFAULT_LIMIT);
        assert_eq!(q.offset, 0);
        assert!(q.search.is_none());
    }

    // --- range string ---

    #[test]
    fn range_string_computed_correctly() {
        let q = DocumentsQuery {
            search: None,
            limit: 10,
            offset: 20,
        };
        assert_eq!(format!("{}-{}", q.offset, q.offset + q.limit - 1), "20-29");
    }

    #[test]
    fn range_string_default() {
        let q = DocumentsQuery {
            search: None,
            limit: DEFAULT_LIMIT,
            offset: 0,
        };
        assert_eq!(
            format!("{}-{}", q.offset, q.offset + q.limit - 1),
            format!("0-{}", DEFAULT_LIMIT - 1)
        );
    }
}
