use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const APPROVE_POSTS_PERMISSION: &str = "approve_posts";
const APPROVE_REPORTS_PERMISSION: &str = "approve_reports";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/users/approvals/logs";

const REPORT_LOG_COLUMNS: &str = "id, report_id, title, content, feedback, score, scores, created_at, report_approval_status, approved_at";

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

pub(crate) async fn handle_workspaces_users_approvals_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = approvals_logs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => approvals_logs_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn approvals_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the caller. Mirrors getPermissions returning null (-> 404)
    // when there is no authenticated principal.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(404, "Not found");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(404, "Not found");
    };

    // Resolve workspace aliases (personal/internal/handle) to a concrete id.
    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, "Internal server error"),
        };

    // getPermissions returns null when the caller is not a workspace member,
    // which the legacy route surfaces as a 404.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, "Not found"),
        Err(()) => return message_response(500, "Internal server error"),
    }

    // Parse query parameters: kind=reports|posts (+ reportId|postId).
    let query = parse_query(request.url);

    let kind = match query.kind.as_deref() {
        Some("reports") => Kind::Reports,
        Some("posts") => Kind::Posts,
        _ => {
            return invalid_query_response();
        }
    };

    match kind {
        Kind::Reports => {
            let can_approve_reports = match has_workspace_permission(
                contact_data,
                outbound,
                &user_id,
                &resolved_ws_id,
                APPROVE_REPORTS_PERMISSION,
            )
            .await
            {
                Ok(value) => value,
                Err(()) => return message_response(500, "Internal server error"),
            };
            if !can_approve_reports {
                return message_response(403, "Unauthorized");
            }

            let Some(report_id) = query.report_id.as_deref().filter(|id| !id.is_empty()) else {
                return message_response(400, "Report ID is required");
            };

            let params = vec![
                ("select", REPORT_LOG_COLUMNS.to_owned()),
                ("report_id", format!("eq.{report_id}")),
                ("user_ws_id", format!("eq.{resolved_ws_id}")),
                ("report_approval_status", "eq.APPROVED".to_owned()),
                ("order", "created_at.desc".to_owned()),
                ("limit", "1".to_owned()),
            ];

            single_row_response(
                contact_data,
                outbound,
                "external_user_monthly_report_logs_workspace_view",
                &params,
            )
            .await
        }
        Kind::Posts => {
            let can_approve_posts = match has_workspace_permission(
                contact_data,
                outbound,
                &user_id,
                &resolved_ws_id,
                APPROVE_POSTS_PERMISSION,
            )
            .await
            {
                Ok(value) => value,
                Err(()) => return message_response(500, "Internal server error"),
            };
            if !can_approve_posts {
                return message_response(403, "Unauthorized");
            }

            let Some(post_id) = query.post_id.as_deref().filter(|id| !id.is_empty()) else {
                return message_response(400, "Post ID is required");
            };

            let params = vec![
                ("select", "*".to_owned()),
                ("post_id", format!("eq.{post_id}")),
                ("post_approval_status", "eq.APPROVED".to_owned()),
                ("order", "created_at.desc".to_owned()),
                ("limit", "1".to_owned()),
            ];

            single_row_response(contact_data, outbound, "user_group_post_logs", &params).await
        }
    }
}

enum Kind {
    Reports,
    Posts,
}

struct ApprovalsLogsQuery {
    kind: Option<String>,
    report_id: Option<String>,
    post_id: Option<String>,
}

fn parse_query(request_url: Option<&str>) -> ApprovalsLogsQuery {
    let url = request_url.and_then(|url| url::Url::parse(url).ok());

    let mut kind = None;
    let mut report_id = None;
    let mut post_id = None;

    if let Some(url) = url.as_ref() {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "kind" if kind.is_none() => kind = Some(value.into_owned()),
                "reportId" if report_id.is_none() => report_id = Some(value.into_owned()),
                "postId" if post_id.is_none() => post_id = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    ApprovalsLogsQuery {
        kind,
        report_id,
        post_id,
    }
}

/// Performs a single-row PostgREST read against the `private` schema and
/// returns the matched object, or JSON `null` when no row matches (mirroring
/// supabase-js `.maybeSingle()`).
async fn single_row_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    params: &[(&str, String)],
) -> BackendResponse {
    let Some(url) = contact_data.rest_url(table, params) else {
        return message_response(500, "Internal server error");
    };

    let Ok(response) = send_private_get(contact_data, outbound, &url).await else {
        return message_response(500, "Internal server error");
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, "Internal server error");
    }

    let Ok(rows) = response.json::<Vec<Value>>() else {
        return message_response(500, "Internal server error");
    };

    let body = rows.into_iter().next().unwrap_or(Value::Null);
    no_store_response(json_response(200, body))
}

async fn send_private_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn has_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ws_id,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
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
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
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
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        .is_some())
}

async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn approvals_logs_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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

fn invalid_query_response() -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": "Invalid query parameters",
            "issues": [],
        }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
