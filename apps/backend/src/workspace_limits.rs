use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const WORKSPACE_LIMITS_PATH: &str = "/api/v1/workspaces/limits";
const WORKSPACES_TABLE: &str = "workspaces";
const MAX_WORKSPACES_FOR_FREE_USERS: usize = 10;
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const WORKSPACE_LIMIT_ERROR_MESSAGE: &str = "Error checking workspace limit";

pub(crate) async fn handle_workspace_limits_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WORKSPACE_LIMITS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => workspace_limits_response(&config.contact_data, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn workspace_limits_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return workspace_limit_error_response();
    }

    let Some(user) = authenticated_user(contact_data, request, outbound).await else {
        return no_store_response(json_response(
            401,
            json!({
                "message": UNAUTHORIZED_MESSAGE,
            }),
        ));
    };

    if supabase_auth::is_valid_tuturuuu_email(user.email.as_deref()) {
        return workspace_limit_success_response(true, 0, 0, None);
    }

    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return no_store_response(json_response(
            401,
            json!({
                "message": UNAUTHORIZED_MESSAGE,
            }),
        ));
    };

    let current_count = match workspace_count(contact_data, &user_id, outbound).await {
        Ok(count) => count,
        Err(()) => return workspace_limit_error_response(),
    };
    let can_create = current_count < MAX_WORKSPACES_FOR_FREE_USERS;
    let remaining = MAX_WORKSPACES_FOR_FREE_USERS.saturating_sub(current_count);

    workspace_limit_success_response(
        can_create,
        current_count,
        MAX_WORKSPACES_FOR_FREE_USERS,
        Some(remaining),
    )
}

async fn authenticated_user(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<supabase_auth::SupabaseAuthUser> {
    let access_token = supabase_auth::request_access_token(request)?;

    supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
}

async fn workspace_count(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<usize, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACES_TABLE,
        &[
            ("select", "id".to_owned()),
            ("creator_id", format!("eq.{user_id}")),
            ("deleted", "eq.false".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
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

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn workspace_limit_success_response(
    can_create: bool,
    current_count: usize,
    limit: usize,
    remaining: Option<usize>,
) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "canCreate": can_create,
            "currentCount": current_count,
            "limit": limit,
            "remaining": remaining,
        }),
    ))
}

fn workspace_limit_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": WORKSPACE_LIMIT_ERROR_MESSAGE,
        }),
    ))
}
