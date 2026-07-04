//! Handler for `GET /api/v1/documents/:documentId`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/documents/[documentId]/route.ts`.
//!
//! Legacy auth model: `withApiAuth` with `permissions: ['manage_documents']`.
//! The legacy route validates workspace API keys (`ttr_`-prefixed tokens) via
//! scrypt hashing against the `workspace_api_keys` table, then reads the
//! workspace ID from the API key context. The URL path carries no workspace ID
//! segment; the ws_id comes entirely from the validated API key.
//!
//! BEHAVIOR GAPS vs. legacy:
//!
//! - **Workspace API key authentication is not supported.** The crate does not
//!   include a scrypt dependency, and `BackendRequest` does not carry a
//!   pre-validated workspace ID from an API key context. Requests authenticated
//!   with a `ttr_`-prefixed workspace API key will receive `401 Unauthorized`
//!   from this handler instead of being served. Those requests continue to work
//!   via the still-live Next.js route for `GET`, `PATCH`, and `DELETE`.
//!
//! - **Session-based fallback.** This handler implements the nearest available
//!   authenticated path: Supabase session authentication (Bearer JWT or
//!   Supabase cookie). It fetches the document by ID using the service-role
//!   client (bypassing RLS), extracts the `ws_id`, then verifies the caller's
//!   `manage_documents` permission in that workspace via
//!   `workspace_permission_check::authorize_workspace_permission`.
//!
//! - **Document existence is visible to authenticated non-members.** Because
//!   the service-role fetch occurs before the per-workspace permission check, a
//!   caller with any valid Supabase session can distinguish a non-existent
//!   document (404) from an unauthorised one (403). The legacy route's API key
//!   model did not have this distinction for session users.
//!
//! Status codes mirror the legacy route:
//!
//! - unauthenticated request                             -> `401`
//! - authenticated, lacks `manage_documents` permission  -> `403`
//! - document not found                                  -> `404`
//! - upstream or configuration failure                   -> `500`
//! - success -> `200 { "data": { "id", "name", "content", "isPublic", "createdAt" } }`
//!
//! `PATCH` and `DELETE` return `None`; the still-live Next.js route handles them.

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const DOCUMENTS_PATH_PREFIX: &str = "/api/v1/documents/";
const MANAGE_DOCUMENTS_PERMISSION: &str = "manage_documents";

#[derive(Deserialize)]
struct DocumentRow {
    id: Option<String>,
    name: Option<String>,
    content: Option<String>,
    is_public: Option<bool>,
    ws_id: Option<String>,
    created_at: Option<String>,
}

#[derive(Serialize)]
struct DocumentResponseBody {
    data: DocumentData,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentData {
    id: String,
    name: String,
    content: Option<String>,
    is_public: bool,
    created_at: String,
}

pub(crate) async fn handle_documents_documentid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let document_id = document_id_from_path(request.path)?;

    Some(match request.method {
        "GET" => get_document_response(config, request, document_id, outbound).await,
        _ => return None,
    })
}

async fn get_document_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    document_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !config.contact_data.configured() {
        return internal_error_response("Failed to fetch document", "DOCUMENT_FETCH_ERROR");
    }

    // Reject requests with no session token before making any upstream calls.
    // Workspace API key callers (ttr_... tokens that are not Supabase JWTs)
    // pass this check but will fail during the Supabase /auth/v1/user call
    // inside authorize_workspace_permission below.
    if supabase_auth::request_access_token(request).is_none() {
        return unauthorized_response(
            "Missing or invalid Authorization header. \
             Expected: \"Authorization: Bearer <api_key>\"",
            "MISSING_API_KEY",
        );
    }

    // Fetch the document with the service-role key so we can read ws_id
    // without knowing it in advance (the URL carries no workspace segment).
    let row = match fetch_document_row(&config.contact_data, outbound, document_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return not_found_response("Document not found", "DOCUMENT_NOT_FOUND"),
        Err(()) => {
            return internal_error_response("Failed to fetch document", "DOCUMENT_FETCH_ERROR");
        }
    };

    let Some(ws_id) = row.ws_id.as_deref().filter(|id| !id.is_empty()) else {
        return internal_error_response("Failed to fetch document", "DOCUMENT_FETCH_ERROR");
    };

    // Verify the caller has manage_documents in the document's workspace.
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ws_id,
        MANAGE_DOCUMENTS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_authorization) => {}
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
            return internal_error_response("Failed to fetch document", "DOCUMENT_FETCH_ERROR");
        }
    }

    let id = row.id.unwrap_or_default();
    let name = row.name.unwrap_or_default();
    let content = row.content;
    let is_public = row.is_public.unwrap_or(false);
    let created_at = row.created_at.unwrap_or_default();

    no_store_response(json_response(
        200,
        DocumentResponseBody {
            data: DocumentData {
                id,
                name,
                content,
                is_public,
                created_at,
            },
        },
    ))
}

async fn fetch_document_row(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    document_id: &str,
) -> Result<Option<DocumentRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_documents",
            &[
                (
                    "select",
                    "id,name,content,is_public,ws_id,created_at".to_owned(),
                ),
                ("id", format!("eq.{document_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<DocumentRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

fn document_id_from_path(path: &str) -> Option<&str> {
    let id = path.strip_prefix(DOCUMENTS_PATH_PREFIX)?;
    (!id.is_empty() && !id.contains('/')).then_some(id)
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

fn not_found_response(message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        404,
        json!({ "error": "Not Found", "message": message, "code": code }),
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
    fn document_id_from_path_extracts_uuid() {
        assert_eq!(
            document_id_from_path("/api/v1/documents/11111111-1111-4111-8111-111111111111"),
            Some("11111111-1111-4111-8111-111111111111"),
        );
    }

    #[test]
    fn document_id_from_path_rejects_wrong_prefix() {
        assert_eq!(document_id_from_path("/api/v2/documents/abc"), None);
        assert_eq!(document_id_from_path("/documents/abc"), None);
        assert_eq!(
            document_id_from_path("/api/v1/workspaces/xxx/documents/abc"),
            None,
        );
    }

    #[test]
    fn document_id_from_path_rejects_sub_paths() {
        assert_eq!(
            document_id_from_path("/api/v1/documents/some-id/sub-resource"),
            None,
        );
    }

    #[test]
    fn document_id_from_path_rejects_empty_id() {
        assert_eq!(document_id_from_path("/api/v1/documents/"), None);
    }

    #[test]
    fn document_id_from_path_rejects_bare_prefix_without_slash() {
        assert_eq!(document_id_from_path("/api/v1/documents"), None);
    }

    #[test]
    fn document_response_body_serializes_camel_case_fields() {
        let body = DocumentResponseBody {
            data: DocumentData {
                id: "doc-1".to_owned(),
                name: "My Doc".to_owned(),
                content: Some("Hello".to_owned()),
                is_public: true,
                created_at: "2024-01-01T00:00:00Z".to_owned(),
            },
        };
        let value = serde_json::to_value(&body).unwrap();
        assert_eq!(value["data"]["id"], "doc-1");
        assert_eq!(value["data"]["name"], "My Doc");
        assert_eq!(value["data"]["content"], "Hello");
        assert_eq!(value["data"]["isPublic"], true);
        assert_eq!(value["data"]["createdAt"], "2024-01-01T00:00:00Z");
        // ws_id must not leak into the response
        assert!(value["data"].get("wsId").is_none());
        assert!(value["data"].get("ws_id").is_none());
    }

    #[test]
    fn document_response_body_serializes_null_content() {
        let body = DocumentResponseBody {
            data: DocumentData {
                id: "doc-2".to_owned(),
                name: "Empty".to_owned(),
                content: None,
                is_public: false,
                created_at: "2024-06-01T00:00:00Z".to_owned(),
            },
        };
        let value = serde_json::to_value(&body).unwrap();
        assert!(value["data"]["content"].is_null());
        assert_eq!(value["data"]["isPublic"], false);
    }
}
