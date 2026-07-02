//! Handler for `GET /api/v1/documents`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/documents/route.ts`.
//!
//! Legacy auth model: `withApiAuth` with `permissions: ['manage_documents']`.
//! The legacy route validates workspace API keys (`ttr_`-prefixed tokens) and
//! reads the workspace ID (`wsId`) from the validated API key context. The URL
//! path carries no workspace ID segment.
//!
//! BEHAVIOR GAPS vs. legacy:
//!
//! - **Workspace API key authentication is not supported.** The crate has no
//!   scrypt dependency and `BackendRequest` carries no pre-validated workspace
//!   ID from an API key context. Requests using `ttr_`-prefixed workspace API
//!   keys receive `401 Unauthorized` from this handler. Those requests continue
//!   to work via the still-live Next.js route for `GET` and `POST`.
//!
//! - **`wsId` must be supplied as a query parameter.** Because the workspace ID
//!   cannot be derived from the session token alone, callers using Supabase
//!   session auth must pass `?wsId=<uuid-or-slug>` in the query string. The
//!   handler returns `400 Bad Request` when `wsId` is absent or empty.
//!
//! - **Data is read with the service-role key.** The legacy route reads using
//!   the caller's Supabase session (RLS active). This handler uses the
//!   service-role key after independently verifying the caller's
//!   `manage_documents` permission via
//!   `workspace_permission_check::authorize_workspace_permission`.
//!
//! Status codes mirror the legacy route:
//!
//! - missing `wsId` query parameter                           -> `400`
//! - unauthenticated / invalid session token                  -> `401`
//! - authenticated, lacks `manage_documents` permission       -> `403`
//! - configuration or upstream failure                        -> `500`
//! - success -> `200 { "data": [...], "pagination": { "limit", "offset",
//!   "filteredTotal" } }`
//!
//! `POST` returns `None`; the still-live Next.js route handles it.

use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_paginated_list::{parse_js_parse_int_prefix, total_count_from_content_range},
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const DOCUMENTS_PATH: &str = "/api/v1/documents";
const MANAGE_DOCUMENTS_PERMISSION: &str = "manage_documents";
const DEFAULT_LIMIT: i64 = 50;
const MAX_LIMIT: i64 = 255;

#[derive(Deserialize)]
struct DocumentRow {
    id: Option<String>,
    name: Option<String>,
    is_public: Option<bool>,
    created_at: Option<String>,
}

struct DocumentsQuery {
    ws_id: Option<String>,
    search: Option<String>,
    limit: i64,
    offset: i64,
    is_public: Option<bool>,
}

pub(crate) async fn handle_documents_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != DOCUMENTS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => get_documents_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn get_documents_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return internal_error_response("Failed to list documents", "DOCUMENTS_LIST_ERROR");
    }

    let query = documents_query_from_url(request.url);

    let Some(raw_ws_id) = query.ws_id.as_deref().filter(|id| !id.is_empty()) else {
        return bad_request_response("Missing wsId query parameter", "MISSING_WS_ID");
    };

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
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return unauthorized_response("Invalid or expired API key", "INVALID_API_KEY");
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return forbidden_response(
                "Insufficient permissions. Required: manage_documents",
                "INSUFFICIENT_PERMISSIONS",
            );
        }
        Err(
            WorkspacePermissionAuthorizationError::NotFound
            | WorkspacePermissionAuthorizationError::Internal,
        ) => {
            return internal_error_response("Failed to list documents", "DOCUMENTS_LIST_ERROR");
        }
    };

    match fetch_documents(&config.contact_data, outbound, &authorization.ws_id, &query).await {
        Ok((rows, filtered_total)) => {
            let data = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.id.unwrap_or_default(),
                        "name": row.name.unwrap_or_default(),
                        "isPublic": row.is_public.unwrap_or(false),
                        "createdAt": row.created_at.unwrap_or_default(),
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
        Err(()) => internal_error_response("Failed to list documents", "DOCUMENTS_LIST_ERROR"),
    }
}

async fn fetch_documents(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    query: &DocumentsQuery,
) -> Result<(Vec<DocumentRow>, i64), ()> {
    let mut params = vec![
        ("select", "id,name,is_public,created_at".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("order", "created_at.desc".to_owned()),
    ];

    if let Some(search) = &query.search {
        params.push(("name", format!("ilike.%{search}%")));
    }

    if let Some(is_public) = query.is_public {
        params.push(("is_public", format!("eq.{is_public}")));
    }

    let url = contact_data
        .rest_url("workspace_documents", &params)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");
    let range = documents_range(query);

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

    let filtered_total = total_count_from_content_range(&response)
        .map(|n| n as i64)
        .unwrap_or(0);
    let rows = response.json::<Vec<DocumentRow>>().map_err(|_| ())?;

    Ok((rows, filtered_total))
}

fn documents_query_from_url(request_url: Option<&str>) -> DocumentsQuery {
    let mut query = DocumentsQuery {
        ws_id: None,
        search: None,
        limit: DEFAULT_LIMIT,
        offset: 0,
        is_public: None,
    };
    let Some(url) = request_url.and_then(|u| url::Url::parse(u).ok()) else {
        return query;
    };
    let mut saw_limit = false;
    let mut saw_offset = false;
    let mut saw_is_public = false;

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "wsId" if query.ws_id.is_none() => {
                let normalized = value.trim().to_owned();
                if !normalized.is_empty() {
                    query.ws_id = Some(normalized);
                }
            }
            "search" if query.search.is_none() => {
                let normalized = value.trim().to_owned();
                if !normalized.is_empty() {
                    query.search = Some(normalized);
                }
            }
            "limit" if !saw_limit => {
                if let Some(n) = parse_js_parse_int_prefix(&value) {
                    query.limit = n.clamp(1, MAX_LIMIT);
                }
                saw_limit = true;
            }
            "offset" if !saw_offset => {
                if let Some(n) = parse_js_parse_int_prefix(&value) {
                    query.offset = n.max(0);
                }
                saw_offset = true;
            }
            "isPublic" if !saw_is_public => {
                query.is_public = match value.as_ref() {
                    "true" => Some(true),
                    "false" => Some(false),
                    _ => None,
                };
                saw_is_public = true;
            }
            _ => {}
        }
    }

    query
}

fn documents_range(query: &DocumentsQuery) -> String {
    format!("{}-{}", query.offset, query.offset + query.limit - 1)
}

fn bad_request_response(message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": "Bad Request", "message": message, "code": code }),
    ))
}

fn unauthorized_response(message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({ "error": "Unauthorized", "message": message, "code": code }),
    ))
}

fn forbidden_response(message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        403,
        json!({ "error": "Forbidden", "message": message, "code": code }),
    ))
}

fn internal_error_response(message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "error": "Internal Server Error", "message": message, "code": code }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn documents_query_from_url_uses_defaults_when_no_params() {
        let query =
            documents_query_from_url(Some("https://example.com/api/v1/documents?wsId=ws-1"));
        assert_eq!(query.limit, DEFAULT_LIMIT);
        assert_eq!(query.offset, 0);
        assert!(query.search.is_none());
        assert!(query.is_public.is_none());
    }

    #[test]
    fn documents_query_from_url_parses_all_params() {
        let query = documents_query_from_url(Some(
            "https://example.com/api/v1/documents\
             ?wsId=ws-1&search=hello&limit=10&offset=20&isPublic=true",
        ));
        assert_eq!(query.ws_id.as_deref(), Some("ws-1"));
        assert_eq!(query.search.as_deref(), Some("hello"));
        assert_eq!(query.limit, 10);
        assert_eq!(query.offset, 20);
        assert_eq!(query.is_public, Some(true));
    }

    #[test]
    fn documents_query_from_url_parses_is_public_false() {
        let query = documents_query_from_url(Some(
            "https://example.com/api/v1/documents?wsId=ws-1&isPublic=false",
        ));
        assert_eq!(query.is_public, Some(false));
    }

    #[test]
    fn documents_query_from_url_ignores_unknown_is_public_value() {
        let query = documents_query_from_url(Some(
            "https://example.com/api/v1/documents?wsId=ws-1&isPublic=maybe",
        ));
        assert_eq!(query.is_public, None);
    }

    #[test]
    fn documents_query_from_url_clamps_limit_to_max() {
        let query = documents_query_from_url(Some(
            "https://example.com/api/v1/documents?wsId=ws-1&limit=999",
        ));
        assert_eq!(query.limit, MAX_LIMIT);
    }

    #[test]
    fn documents_query_from_url_clamps_limit_zero_to_one() {
        let query = documents_query_from_url(Some(
            "https://example.com/api/v1/documents?wsId=ws-1&limit=0",
        ));
        assert_eq!(query.limit, 1);
    }

    #[test]
    fn documents_query_from_url_clamps_negative_offset_to_zero() {
        let query = documents_query_from_url(Some(
            "https://example.com/api/v1/documents?wsId=ws-1&offset=-5",
        ));
        assert_eq!(query.offset, 0);
    }

    #[test]
    fn documents_query_from_url_returns_defaults_on_none_url() {
        let query = documents_query_from_url(None);
        assert_eq!(query.limit, DEFAULT_LIMIT);
        assert_eq!(query.offset, 0);
        assert!(query.ws_id.is_none());
    }

    #[test]
    fn documents_query_from_url_ignores_empty_ws_id() {
        let query = documents_query_from_url(Some("https://example.com/api/v1/documents?wsId="));
        assert!(query.ws_id.is_none());
    }

    #[test]
    fn documents_range_computes_correct_range() {
        let query = DocumentsQuery {
            ws_id: None,
            search: None,
            limit: 10,
            offset: 20,
            is_public: None,
        };
        assert_eq!(documents_range(&query), "20-29");
    }

    #[test]
    fn documents_range_uses_defaults() {
        let query = DocumentsQuery {
            ws_id: None,
            search: None,
            limit: DEFAULT_LIMIT,
            offset: 0,
            is_public: None,
        };
        assert_eq!(documents_range(&query), format!("0-{}", DEFAULT_LIMIT - 1));
    }
}
