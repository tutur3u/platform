mod permissions;
mod workspace;

use crate::{
    BackendConfig, BackendRequest, contact,
    infrastructure_inventory_exports::auth::{
        permissions::has_inventory_read_permission, workspace::normalize_workspace_id,
    },
    outbound::OutboundHttpClient,
    supabase_auth,
};

pub(super) const INSUFFICIENT_INVENTORY_PERMISSION_MESSAGE: &str =
    "Insufficient permissions to view inventory";

const INVENTORY_APP_SESSION_TARGETS: [&str; 1] = ["inventory"];

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct AuthenticatedInventoryUser {
    pub(super) access_token: Option<String>,
    pub(super) id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct InventoryExportAuthorization {
    pub(super) ws_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum InventoryExportAuthorizationError {
    Forbidden,
    InsufficientPermissions,
    Internal,
    NotFound,
    Unauthorized,
}

pub(super) async fn authorize_inventory_export(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<InventoryExportAuthorization, InventoryExportAuthorizationError> {
    let user = authenticated_inventory_user(config, request, outbound)
        .await
        .ok_or(InventoryExportAuthorizationError::Unauthorized)?;
    let ws_id = normalize_workspace_id(&config.contact_data, outbound, raw_ws_id, &user)
        .await
        .map_err(|_| InventoryExportAuthorizationError::Internal)?
        .ok_or(InventoryExportAuthorizationError::NotFound)?;
    let has_permission =
        has_inventory_read_permission(&config.contact_data, outbound, &ws_id, &user)
            .await
            .map_err(|_| InventoryExportAuthorizationError::Internal)?
            .ok_or(InventoryExportAuthorizationError::Forbidden)?;

    if has_permission {
        Ok(InventoryExportAuthorization { ws_id })
    } else {
        Err(InventoryExportAuthorizationError::InsufficientPermissions)
    }
}

async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<AuthenticatedInventoryUser> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id).map(|id| AuthenticatedInventoryUser {
            access_token: None,
            id,
        });
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = non_empty_user_id(user.id?)?;

    Some(AuthenticatedInventoryUser {
        access_token: Some(access_token),
        id,
    })
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}
