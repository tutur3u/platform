use super::*;
use crate::{
    APPLICATION_JSON, contact,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

// ---------------------------------------------------------------------------
// Supabase reads (service role)
// ---------------------------------------------------------------------------

pub(super) async fn fetch_member_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id, name, personal, avatar_url, logo_url, created_at, creator_id, \
                 workspace_members!inner(user_id), \
                 workspace_subscriptions!left(created_at, status, product_id)"
                    .to_owned(),
            ),
            ("workspace_members.user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<WorkspaceRow>>().map_err(|_| ())
}

pub(super) async fn fetch_public_profile(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<PublicProfileRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "users",
        &[
            ("select", "display_name, handle, avatar_url".to_owned()),
            ("id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<PublicProfileRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

pub(super) async fn fetch_private_details(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<PrivateDetailsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<PrivateDetailsRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

const GUEST_SHARE_SELECT: &str = "board_id, permission, \
     workspace_boards!inner(id, ws_id, deleted_at, \
     workspaces!inner(id, name, personal, avatar_url, logo_url, creator_id, \
     workspace_subscriptions!left(created_at, status, product_id)))";

pub(super) async fn fetch_guest_shares_by_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", GUEST_SHARE_SELECT.to_owned()),
            ("shared_with_user_id", format!("eq.{user_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<GuestShareRow>>().map_err(|_| ())
}

pub(super) async fn fetch_guest_shares_by_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    email: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", GUEST_SHARE_SELECT.to_owned()),
            ("shared_with_email", format!("eq.{email}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, false).await?;
    if !is_success(response.status) {
        return Err(());
    }
    response.json::<Vec<GuestShareRow>>().map_err(|_| ())
}

pub(super) async fn fetch_subscription_product_tier_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_ids: &HashSet<String>,
) -> Result<HashMap<String, Option<String>>, ()> {
    let mut map: HashMap<String, Option<String>> = HashMap::new();
    if product_ids.is_empty() {
        return Ok(map);
    }

    let in_list = product_ids.iter().cloned().collect::<Vec<_>>().join(",");
    let Some(url) = contact_data.rest_url(
        "workspace_subscription_products",
        &[
            ("select", "id, tier".to_owned()),
            ("id", format!("in.({in_list})")),
        ],
    ) else {
        return Err(());
    };
    // workspace_subscription_products lives in the `private` schema.
    let response = service_role_get(contact_data, outbound, &url, true).await?;
    if !is_success(response.status) {
        return Ok(map);
    }

    for product in response.json::<Vec<ProductTierRow>>().map_err(|_| ())? {
        if let Some(id) = product.id {
            map.insert(id, normalize_workspace_tier(product.tier.as_deref()));
        }
    }

    Ok(map)
}

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if private_schema {
        request = request.with_header("Accept-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(request).await.map_err(|_| ())
}
