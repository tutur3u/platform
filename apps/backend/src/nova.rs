use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const NOVA_ME_TEAM_PATH: &str = "/api/v1/nova/me/team";
const NOVA_TEAM_MEMBERS_TABLE: &str = "nova_team_members";
const PRIVATE_SCHEMA: &str = "private";
const NOVA_APP_SESSION_TARGETS: [&str; 1] = ["nova"];

#[derive(Debug)]
struct AuthenticatedNovaUser {
    id: String,
}

#[derive(Deserialize)]
struct NovaTeamMemberRow {
    team_id: Option<String>,
}

pub(crate) async fn handle_nova_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != NOVA_ME_TEAM_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => nova_me_team_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn nova_me_team_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_user(config, request, outbound).await {
        Ok(user) => user,
        Err(()) => return unauthorized_response(),
    };

    let team_id = match fetch_current_team_id(&config.contact_data, &user.id, outbound).await {
        Ok(team_id) => team_id,
        Err(()) => return failed_to_load_current_team_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "teamId": team_id,
        }),
    ))
}

async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<AuthenticatedNovaUser, ()> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &NOVA_APP_SESSION_TARGETS)?;

        return non_empty_user_id(identity.id);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(());
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return Err(());
    };
    let Some(id) = user.id else {
        return Err(());
    };

    non_empty_user_id(id)
}

async fn fetch_current_team_id(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        NOVA_TEAM_MEMBERS_TABLE,
        &[
            ("select", "team_id".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "2".to_owned()),
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<NovaTeamMemberRow>>().map_err(|_| ())?;
    if rows.len() > 1 {
        return Err(());
    }

    Ok(rows.first().and_then(|row| row.team_id.clone()))
}

fn non_empty_user_id(id: String) -> Result<AuthenticatedNovaUser, ()> {
    let id = id.trim().to_owned();
    if id.is_empty() {
        return Err(());
    }

    Ok(AuthenticatedNovaUser { id })
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn failed_to_load_current_team_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": "Failed to load current team",
        }),
    ))
}
