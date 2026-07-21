use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ADMIN_AI_CREDITS_FEATURES_PATH: &str = "/api/v1/admin/ai-credits/features";
const AI_CREDIT_FEATURE_ACCESS_TABLE: &str = "ai_credit_feature_access";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ROOT_ADMIN_REQUIRED_MESSAGE: &str = "Root workspace admin required";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch feature access";

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

pub(crate) async fn handle_admin_ai_credits_features_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != ADMIN_AI_CREDITS_FEATURES_PATH {
        return None;
    }

    // Only the GET method is migrated to the Worker. Every other method
    // (e.g. PUT) remains owned by the infrastructure satellite, so we return
    // None rather than a 405 for those.
    Some(match request.method {
        "GET" => admin_ai_credits_features_response(config, request, outbound).await,
        _ => return None,
    })
}

async fn admin_ai_credits_features_response(
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

    match fetch_feature_access(contact_data, outbound).await {
        Ok(data) => no_store_response(json_response(200, data)),
        Err(()) => message_response(500, FETCH_FAILED_MESSAGE),
    }
}

/// Mirrors `verifyWorkspaceMembershipType({ wsId: ROOT_WORKSPACE_ID, requiredType: 'MEMBER' })`.
///
/// Queries `workspace_members` for the caller's row in the root workspace using
/// the caller's access token so RLS is respected, exactly like the legacy
/// session-scoped Supabase client.
///
/// NOTE: This is a file-local copy of the equivalent helper in
/// `admin_ai_credits_overview.rs`; it is duplicated here intentionally so this
/// module stays self-contained without editing the shared module.
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

/// Selects every row of `ai_credit_feature_access` ordered by `tier` then
/// `feature`, matching the legacy `sbAdmin.from(...).select('*').order('tier')
/// .order('feature')` call. The query runs with the service role
/// (`createAdminClient`) and the raw array is returned verbatim so the
/// response shape matches the legacy route exactly.
async fn fetch_feature_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let url = contact_data
        .rest_url(
            AI_CREDIT_FEATURE_ACCESS_TABLE,
            &[
                ("select", "*".to_owned()),
                ("order", "tier.asc,feature.asc".to_owned()),
            ],
        )
        .ok_or(())?;
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

    response.json::<Value>().map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
