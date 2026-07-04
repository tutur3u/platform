use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ADMIN_AI_CREDITS_OVERVIEW_PATH: &str = "/api/v1/admin/ai-credits/overview";
const PLATFORM_AI_CREDIT_OVERVIEW_RPC: &str = "get_platform_ai_credit_overview";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ROOT_ADMIN_REQUIRED_MESSAGE: &str = "Root workspace admin required";
const PLATFORM_OVERVIEW_FAILED_MESSAGE: &str = "Failed to get platform overview";

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

/// Outcome of resolving the root-workspace membership for the caller.
enum MembershipOutcome {
    /// Caller is a root-workspace MEMBER (admin).
    Member,
    /// Caller is authenticated but not a root admin (missing or non-MEMBER type).
    Forbidden,
    /// The membership lookup itself failed (DB / transport error).
    LookupFailed,
}

pub(crate) async fn handle_admin_ai_credits_overview_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ADMIN_AI_CREDITS_OVERVIEW_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => admin_ai_credits_overview_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn admin_ai_credits_overview_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    match verify_root_workspace_member(contact_data, outbound, &access_token, &user_id).await {
        MembershipOutcome::Member => {}
        MembershipOutcome::LookupFailed => {
            return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        }
        MembershipOutcome::Forbidden => {
            return message_response(403, ROOT_ADMIN_REQUIRED_MESSAGE);
        }
    }

    match fetch_platform_ai_credit_overview(contact_data, outbound).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => message_response(500, PLATFORM_OVERVIEW_FAILED_MESSAGE),
    }
}

/// Mirrors `verifyWorkspaceMembershipType({ wsId: ROOT_WORKSPACE_ID, requiredType: 'MEMBER' })`.
///
/// Queries `workspace_members` for the caller's row in the root workspace using
/// the caller's access token so RLS is respected, exactly like the legacy
/// session-scoped Supabase client.
async fn verify_root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> MembershipOutcome {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return MembershipOutcome::LookupFailed;
    };

    let Some(service_role_key) = contact_data.service_role_key() else {
        return MembershipOutcome::LookupFailed;
    };
    let authorization = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if !(200..300).contains(&response.status) {
        return MembershipOutcome::LookupFailed;
    }

    let rows = match response.json::<Vec<WorkspaceMembershipRow>>() {
        Ok(rows) => rows,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    let is_member = rows.first().and_then(|row| row.membership_type.as_deref()) == Some("MEMBER");

    if is_member {
        MembershipOutcome::Member
    } else {
        MembershipOutcome::Forbidden
    }
}

/// Calls the `get_platform_ai_credit_overview` RPC with the service role,
/// matching the legacy `sbAdmin.rpc(...)` call. Returns the RPC payload
/// verbatim so the response shape matches the legacy route exactly.
async fn fetch_platform_ai_credit_overview(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let rpc_url = contact_data
        .rpc_url(PLATFORM_AI_CREDIT_OVERVIEW_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body("{}"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
