use super::*;

// ---------- Guest shares ----------

pub(super) async fn load_guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    auth_email: Option<&str>,
) -> Result<Vec<GuestShare>, ()> {
    let recipient_email = match normalize_email(auth_email) {
        Some(email) => Some(email),
        None => get_user_private_email(contact_data, outbound, user_id).await?,
    };

    let mut shares: Vec<GuestShare> = Vec::new();

    for share in query_guest_shares(
        contact_data,
        outbound,
        ws_id,
        ("shared_with_user_id", user_id),
    )
    .await?
    {
        shares.push(share);
    }

    if let Some(email) = recipient_email.as_deref() {
        for share in
            query_guest_shares(contact_data, outbound, ws_id, ("shared_with_email", email)).await?
        {
            shares.push(share);
        }
    }

    Ok(shares)
}

async fn query_guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    matcher: (&str, &str),
) -> Result<Vec<GuestShare>, ()> {
    let (filter_key, filter_value) = matcher;
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            (
                "select",
                "board_id,permission,workspace_boards!inner(id,ws_id,deleted_at)".to_owned(),
            ),
            ("workspace_boards.ws_id", format!("eq.{ws_id}")),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
            (filter_key, format!("eq.{filter_value}")),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<TaskBoardShareRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| {
            let board_id = row.board_id.filter(|id| !id.is_empty())?;
            // Legacy requires a non-null permission for the share to be valid.
            let permission = row.permission.filter(|value| !value.is_empty())?;
            Some(GuestShare {
                board_id,
                permission,
            })
        })
        .collect())
}

async fn get_user_private_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
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

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<UserPrivateEmailRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.email)
        .as_deref()
        .and_then(|email| normalize_email(Some(email))))
}

pub(super) fn highest_permission(shares: &[GuestShare]) -> Option<String> {
    if shares.iter().any(|share| share.permission == "edit") {
        Some("edit".to_owned())
    } else if shares.iter().any(|share| share.permission == "view") {
        Some("view".to_owned())
    } else {
        None
    }
}

pub(super) fn permission_rank(permission: &str) -> u8 {
    match permission {
        "edit" => 2,
        "view" => 1,
        _ => 0,
    }
}
