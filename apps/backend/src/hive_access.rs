use serde::Deserialize;
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const HIVE_ACCESS_PATH: &str = "/api/v1/users/me/hive-access";
const HIVE_MEMBERS_TABLE: &str = "hive_members";
const PLATFORM_USER_ROLES_TABLE: &str = "platform_user_roles";
const HIVE_ACCESS_CACHE_CONTROL: &str = "private, max-age=300, stale-while-revalidate=60";

#[derive(Debug)]
pub(crate) struct AuthenticatedHiveUser {
    pub(crate) id: String,
}

#[derive(Deserialize)]
struct HiveMemberRow {
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct PlatformUserRoleRow {
    allow_role_management: Option<bool>,
    enabled: Option<bool>,
}

pub(crate) async fn handle_hive_access_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != HIVE_ACCESS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => hive_access_response(config, request, outbound).await,
        method => method_not_allowed(method, "GET"),
    })
}

async fn hive_access_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_user(
        config,
        request,
        contact::current_user_app_session_targets(),
        outbound,
    )
    .await
    {
        Ok(user) => user,
        Err(()) => return unauthorized_response(),
    };

    let access = match resolve_hive_access(&config.contact_data, &user.id, outbound).await {
        Ok(access) => access,
        Err(()) => return failed_to_resolve_response(),
    };

    hive_access_success_response(access)
}

pub(crate) async fn authenticated_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    expected_app_session_targets: &[&str],
    outbound: &impl OutboundHttpClient,
) -> Result<AuthenticatedHiveUser, ()> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, expected_app_session_targets)?;

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
    let Some(user_id) = user.id else {
        return Err(());
    };

    non_empty_user_id(user_id)
}

fn non_empty_user_id(user_id: String) -> Result<AuthenticatedHiveUser, ()> {
    if user_id.trim().is_empty() {
        return Err(());
    }

    Ok(AuthenticatedHiveUser { id: user_id })
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) struct HiveAccess {
    pub(crate) is_admin: bool,
    pub(crate) is_member: bool,
}

impl HiveAccess {
    pub(crate) fn has_access(&self) -> bool {
        self.is_admin || self.is_member
    }
}

pub(crate) async fn resolve_hive_access(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<HiveAccess, ()> {
    let is_member = hive_member_enabled(contact_data, user_id, outbound).await?;
    let is_admin = platform_role_allows_hive_admin(contact_data, user_id, outbound).await?;

    Ok(HiveAccess {
        is_admin,
        is_member,
    })
}

async fn hive_member_enabled(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let rows = select_rows::<HiveMemberRow>(
        contact_data,
        HIVE_MEMBERS_TABLE,
        "enabled",
        user_id,
        outbound,
    )
    .await?;

    Ok(rows.first().and_then(|row| row.enabled).unwrap_or(false))
}

async fn platform_role_allows_hive_admin(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let rows = select_rows::<PlatformUserRoleRow>(
        contact_data,
        PLATFORM_USER_ROLES_TABLE,
        "enabled,allow_role_management",
        user_id,
        outbound,
    )
    .await?;

    Ok(rows.first().is_some_and(|row| {
        row.enabled.unwrap_or(false) && row.allow_role_management.unwrap_or(false)
    }))
}

async fn select_rows<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    table: &str,
    select: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<T>, ()> {
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", select.to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
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
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<T>>().map_err(|_| ())
}

fn hive_access_success_response(access: HiveAccess) -> BackendResponse {
    let mut response = json_response(
        200,
        json!({
            "hasAccess": access.has_access(),
            "isAdmin": access.is_admin,
            "isMember": access.is_member,
        }),
    );
    response.cache_control = Some(HIVE_ACCESS_CACHE_CONTROL);
    response
}

fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized",
        }),
    ))
}

fn failed_to_resolve_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to resolve Hive access",
        }),
    ))
}
