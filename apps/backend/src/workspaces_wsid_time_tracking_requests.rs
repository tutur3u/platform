//! Handler for `GET /api/v1/workspaces/:wsId/time-tracking/requests`.
//!
//! Ports `apps/web/src/app/api/v1/workspaces/[wsId]/time-tracking/requests/route.ts`.
//! GET only; POST returns `None` so the still-live Next.js route handles it.
//!
//! Gaps vs legacy: workspace-id aliases not resolved; `requestId` not UUID-validated
//! (forwarded as-is); only MEMBER-type accepted; bare app-session Bearer tokens
//! (no Supabase cookie) fail auth where the legacy resolves them server-side.
//!
//! Response: `{ "requests": [...], "totalCount": N, "totalPages": N }`

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/time-tracking/requests";
const PRIVATE_SCHEMA: &str = "private";
const MANAGE_TTR_PERMISSION: &str = "manage_time_tracking_requests";
const DEFAULT_STATUS: &str = "pending";
const DEFAULT_PAGE: u64 = 1;
const DEFAULT_LIMIT: u64 = 10;
const MAX_LIMIT: u64 = 100;
const MIN_LIMIT: u64 = 1;

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Debug)]
struct GetParams {
    status: String,
    user_id_filter: Option<String>,
    request_id_filter: Option<String>,
    page: u64,
    limit: u64,
}

pub(crate) async fn handle_workspaces_wsid_time_tracking_requests_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = extract_ws_id(request.path)?;

    Some(match request.method {
        "GET" => get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

async fn get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, "Internal server error");
    }

    // Authenticate — accepts Supabase session cookie even when an app-session
    // Bearer header is present (allowAppSessionAuth: true in the legacy route).
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|u| u.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    // Verify MEMBER workspace membership via service role.
    match verify_workspace_member(contact_data, outbound, ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return error_response(403, "Workspace access denied"),
        Err(()) => return error_response(500, "Failed to verify workspace access"),
    }

    // Check manage_time_tracking_requests permission. Non-managers can only
    // see their own requests; managers may filter by any userId.
    let can_manage = match authorize_workspace_permission(
        contact_data,
        request,
        ws_id,
        MANAGE_TTR_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => true,
        Err(WorkspacePermissionAuthorizationError::Forbidden) => false,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => false,
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return error_response(404, "Not found");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return error_response(500, "Failed to retrieve permissions");
        }
    };

    let params = match parse_get_params(request.url, can_manage, &user_id) {
        Ok(p) => p,
        Err((status, message)) => return error_response(status, message),
    };

    let total_count = match count_requests(contact_data, outbound, ws_id, &params).await {
        Ok(n) => n,
        Err(()) => return error_response(500, "Failed to retrieve record count"),
    };

    let requests = match fetch_requests(contact_data, outbound, ws_id, &params).await {
        Ok(data) => data,
        Err(()) => return error_response(500, "Internal server error"),
    };

    let total_pages = if params.limit > 0 {
        total_count.div_ceil(params.limit)
    } else {
        0u64
    };

    no_store_response(json_response(
        200,
        json!({
            "requests": requests,
            "totalCount": total_count,
            "totalPages": total_pages,
        }),
    ))
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
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
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

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

fn approval_status_filter(status: &str) -> Option<&'static str> {
    match status {
        "pending" => Some("PENDING"),
        "approved" => Some("APPROVED"),
        "rejected" => Some("REJECTED"),
        "needs_info" => Some("NEEDS_INFO"),
        _ => None,
    }
}

fn build_filter_params<'a>(
    base: Vec<(&'a str, String)>,
    params: &'a GetParams,
    ws_id: &'a str,
) -> Vec<(&'a str, String)> {
    let mut out = base;
    out.push(("workspace_id", format!("eq.{ws_id}")));
    if let Some(s) = approval_status_filter(&params.status) {
        out.push(("approval_status", format!("eq.{s}")));
    }
    if let Some(uid) = &params.user_id_filter {
        out.push(("user_id", format!("eq.{uid}")));
    }
    if let Some(rid) = &params.request_id_filter {
        out.push(("id", format!("eq.{rid}")));
    }
    out
}

async fn count_requests(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &GetParams,
) -> Result<u64, ()> {
    let url_params = build_filter_params(vec![("select", "*".to_owned())], params, ws_id);
    let Some(url) = contact_data.rest_url("time_tracking_requests", &url_params) else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0")
                .with_header("Prefer", "count=exact"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(total_count_from_content_range(&response).unwrap_or(0))
}

async fn fetch_requests(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &GetParams,
) -> Result<Value, ()> {
    let offset = (params.page - 1) * params.limit;
    let range = format!("{offset}-{}", offset + params.limit - 1);

    let url_params = build_filter_params(
        vec![
            ("select", "*".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
        params,
        ws_id,
    );
    let Some(url) = contact_data.rest_url("time_tracking_requests_with_details", &url_params)
    else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Range-Unit", "items")
                .with_header("Range", &range),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn parse_get_params(
    request_url: Option<&str>,
    can_manage: bool,
    caller_user_id: &str,
) -> Result<GetParams, (u16, &'static str)> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok());

    let status = query_value(url.as_ref(), "status")
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_STATUS.to_owned());

    let user_id_param = query_value(url.as_ref(), "userId")
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());

    let request_id_filter = query_value(url.as_ref(), "requestId")
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty());

    if !can_manage
        && let Some(uid) = &user_id_param
        && uid != caller_user_id
    {
        return Err((
            403,
            "You do not have permission to view other users' requests.",
        ));
    }

    let user_id_filter = if can_manage {
        user_id_param
    } else {
        Some(caller_user_id.to_owned())
    };

    let page = coerce_positive_u64(query_value(url.as_ref(), "page").as_deref(), DEFAULT_PAGE);
    let limit = coerce_positive_u64(query_value(url.as_ref(), "limit").as_deref(), DEFAULT_LIMIT)
        .clamp(MIN_LIMIT, MAX_LIMIT);

    Ok(GetParams {
        status,
        user_id_filter,
        request_id_filter,
        page,
        limit,
    })
}

/// Coerce a query-string value to a positive `u64` (JS `Number.isFinite(n) && n > 0 ? n : fallback`).
fn coerce_positive_u64(value: Option<&str>, fallback: u64) -> u64 {
    let Some(raw) = value else { return fallback };
    let Ok(parsed) = raw.trim().parse::<f64>() else {
        return fallback;
    };
    if !parsed.is_finite() || parsed < 1.0 || parsed.fract() != 0.0 {
        return fallback;
    }
    parsed as u64
}

fn query_value(url: Option<&url::Url>, key: &str) -> Option<String> {
    url?.query_pairs()
        .find_map(|(n, v)| (n == key).then(|| v.into_owned()))
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<u64> {
    response
        .header("content-range")?
        .rsplit_once('/')
        .and_then(|(_, t)| t.parse().ok())
}

fn extract_ws_id(path: &str) -> Option<&str> {
    let id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!id.is_empty() && !id.contains('/')).then_some(id)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    const WS: &str = "11111111-1111-4111-8111-111111111111";

    #[test]
    fn extract_ws_id_path_guard() {
        assert_eq!(
            extract_ws_id(&format!("/api/v1/workspaces/{WS}/time-tracking/requests")),
            Some(WS)
        );
        assert_eq!(
            extract_ws_id(&format!("/api/v1/workspaces/{WS}/time-tracking/requests/x")),
            None
        );
        assert_eq!(
            extract_ws_id(&format!("/api/v2/workspaces/{WS}/time-tracking/requests")),
            None
        );
        assert_eq!(
            extract_ws_id("/api/v1/workspaces/a/b/time-tracking/requests"),
            None
        );
    }

    #[test]
    fn approval_status_filter_known_and_unknown() {
        assert_eq!(approval_status_filter("pending"), Some("PENDING"));
        assert_eq!(approval_status_filter("approved"), Some("APPROVED"));
        assert_eq!(approval_status_filter("rejected"), Some("REJECTED"));
        assert_eq!(approval_status_filter("needs_info"), Some("NEEDS_INFO"));
        assert_eq!(approval_status_filter("all"), None);
    }

    #[test]
    fn coerce_positive_u64_cases() {
        assert_eq!(coerce_positive_u64(Some("5"), 10), 5);
        assert_eq!(coerce_positive_u64(Some("3.0"), 10), 3);
        assert_eq!(coerce_positive_u64(None, 10), 10);
        for bad in &["0", "-1", "1.5", "abc"] {
            assert_eq!(coerce_positive_u64(Some(bad), 10), 10, "bad={bad}");
        }
    }

    #[test]
    fn parse_get_params_non_manager_defaults_and_permission_check() {
        let p = parse_get_params(Some("https://x.com/"), false, "u1").unwrap();
        assert_eq!(p.status, "pending");
        assert_eq!((p.page, p.limit), (1, 10));
        assert_eq!(p.user_id_filter, Some("u1".to_owned()));
        // Attempting to see another user's requests is forbidden.
        let (s, _) =
            parse_get_params(Some("https://x.com/?userId=other"), false, "u1").unwrap_err();
        assert_eq!(s, 403);
    }

    #[test]
    fn parse_get_params_manager_controls() {
        let p = parse_get_params(
            Some("https://x.com/?userId=other&limit=999&page=3"),
            true,
            "u1",
        )
        .unwrap();
        assert_eq!(p.user_id_filter, Some("other".to_owned()));
        assert_eq!(p.limit, MAX_LIMIT);
        assert_eq!(p.page, 3);
        // No userId param -> None (see all users).
        let p2 = parse_get_params(Some("https://x.com/"), true, "u1").unwrap();
        assert!(p2.user_id_filter.is_none());
    }
}
