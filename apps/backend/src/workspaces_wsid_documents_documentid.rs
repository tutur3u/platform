//! Handler for `GET /api/v1/workspaces/:wsId/documents/:documentId`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/documents/[documentId]/route.ts`.
//!
//! ## Auth model
//!
//! The legacy route:
//!
//! 1. Resolves the authenticated session user.
//! 2. Verifies workspace membership (MEMBER or GUEST) via
//!    `verifyWorkspaceMembershipType`.
//! 3. Calls `getPermissions({ wsId, request })` and checks the
//!    `manage_documents` permission.
//!
//! This handler reproduces that path using
//! `workspace_permission_check::authorize_workspace_permission` for
//! authentication, workspace-id normalization, and the permission check,
//! matching the legacy status codes:
//!
//! - missing/invalid session or unresolved workspace -> `401 { "message": "Unauthorized" }`
//! - authenticated caller lacking `manage_documents` -> `403 { "message": "Forbidden" }`
//! - configuration / upstream read failure -> `500 { "message": "Internal server error" }`
//!
//! ## Response shape
//!
//! On success the legacy route returns `{ data }` where `data` is a single row
//! from `workspace_documents` with columns `id, name, content, is_public,
//! created_at`. A missing document returns `404 { "error": "Document not found" }`.
//! A Supabase read error returns `400 { "error": "<message>" }`.
//!
//! ## Behavior gaps
//!
//! - The PATCH and DELETE methods are not ported; `None` is returned for every
//!   non-GET method so the request falls through to the still-live Next.js route.
//! - The legacy route sets no explicit `Cache-Control` header; this handler
//!   applies `no-store` semantics, consistent with other read-only handlers in
//!   this crate.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const MANAGE_DOCUMENTS_PERMISSION: &str = "manage_documents";

#[derive(Deserialize)]
struct DocumentRow {
    id: Option<Value>,
    name: Option<Value>,
    content: Option<Value>,
    is_public: Option<Value>,
    created_at: Option<Value>,
}

pub(crate) async fn handle_workspaces_wsid_documents_documentid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, document_id) = document_path_params(request.path)?;

    Some(match request.method {
        "GET" => document_get_response(config, request, raw_ws_id, document_id, outbound).await,
        _ => return None,
    })
}

async fn document_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    document_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // 1. Authenticate and authorize.
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
            return unauthorized_response();
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return unauthorized_response();
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return forbidden_response();
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return internal_error_response();
        }
    };

    // 2. Fetch the document with the service-role (admin) client (RLS bypassed).
    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return internal_error_response();
    }

    let url = match contact_data.rest_url(
        "workspace_documents",
        &[
            ("select", "id,name,content,is_public,created_at".to_owned()),
            ("id", format!("eq.{document_id}")),
            ("ws_id", format!("eq.{}", authorization.ws_id)),
        ],
    ) {
        Some(u) => u,
        None => return internal_error_response(),
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(k) => k,
        None => return internal_error_response(),
    };
    let bearer = format!("Bearer {service_role_key}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(r) => r,
        Err(_) => return internal_error_response(),
    };

    if !(200..300).contains(&response.status) {
        let msg = response
            .json::<Value>()
            .ok()
            .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
            .unwrap_or_else(|| "Error loading document".to_owned());
        return no_store_response(json_response(400, json!({ "error": msg })));
    }

    // PostgREST returns an array even for a single-row select; mirror `.maybeSingle()`.
    let rows: Vec<DocumentRow> = match response.json() {
        Ok(r) => r,
        Err(_) => return internal_error_response(),
    };

    match rows.into_iter().next() {
        None => no_store_response(json_response(404, json!({ "error": "Document not found" }))),
        Some(row) => {
            let data = json!({
                "id": row.id,
                "name": row.name,
                "content": row.content,
                "is_public": row.is_public,
                "created_at": row.created_at,
            });
            no_store_response(json_response(200, json!({ "data": data })))
        }
    }
}

/// Extracts `(raw_ws_id, document_id)` from the request path.
///
/// Returns `None` when the path does not match
/// `/api/v1/workspaces/<wsId>/documents/<documentId>` exactly.
fn document_path_params(path: &str) -> Option<(&str, &str)> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // Expected: api / v1 / workspaces / <wsId> / documents / <documentId>
    if segments.len() != 6 {
        return None;
    }
    if segments.first() != Some(&"api")
        || segments.get(1) != Some(&"v1")
        || segments.get(2) != Some(&"workspaces")
        || segments.get(4) != Some(&"documents")
    {
        return None;
    }

    let ws_id = *segments.get(3)?;
    let document_id = *segments.get(5)?;
    if ws_id.is_empty() || document_id.is_empty() {
        return None;
    }

    Some((ws_id, document_id))
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
}

fn forbidden_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "message": "Forbidden" })))
}

fn internal_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Internal server error" }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------------------------
    // document_path_params — path guard / extraction
    // ---------------------------------------------------------------------------

    #[test]
    fn extracts_params_from_valid_path() {
        let ws = "11111111-1111-4111-8111-111111111111";
        let doc = "22222222-2222-4222-8222-222222222222";
        let path = format!("/api/v1/workspaces/{ws}/documents/{doc}");
        assert_eq!(document_path_params(&path), Some((ws, doc)));
    }

    #[test]
    fn returns_none_for_wrong_prefix() {
        let ws = "some-ws";
        let doc = "some-doc";
        let path = format!("/api/workspaces/{ws}/documents/{doc}");
        assert!(document_path_params(&path).is_none());
    }

    #[test]
    fn returns_none_for_wrong_inner_segment() {
        let path = "/api/v1/workspaces/ws-id/notes/doc-id";
        assert!(document_path_params(path).is_none());
    }

    #[test]
    fn returns_none_for_extra_trailing_segment() {
        let path = "/api/v1/workspaces/ws-id/documents/doc-id/extra";
        assert!(document_path_params(path).is_none());
    }

    #[test]
    fn returns_none_for_empty_ws_id() {
        let path = "/api/v1/workspaces//documents/doc-id";
        assert!(document_path_params(path).is_none());
    }

    #[test]
    fn returns_none_for_empty_document_id() {
        // After filtering empty segments this collapses to 5 segments.
        let path = "/api/v1/workspaces/ws-id/documents/";
        assert!(document_path_params(path).is_none());
    }

    #[test]
    fn returns_none_for_missing_document_segment() {
        let path = "/api/v1/workspaces/ws-id/documents";
        assert!(document_path_params(path).is_none());
    }

    // ---------------------------------------------------------------------------
    // response helpers — verify JSON shape
    // ---------------------------------------------------------------------------

    #[test]
    fn unauthorized_response_has_correct_status() {
        // The shape of BackendResponse is verified by spot-checking its fields.
        let resp = unauthorized_response();
        assert_eq!(resp.status, 401);
    }

    #[test]
    fn forbidden_response_has_correct_status() {
        let resp = forbidden_response();
        assert_eq!(resp.status, 403);
    }

    #[test]
    fn internal_error_response_has_correct_status() {
        let resp = internal_error_response();
        assert_eq!(resp.status, 500);
    }
}
