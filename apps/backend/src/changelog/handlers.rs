use super::*;

pub(super) async fn changelog_create_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };
    let payload = match create_changelog_payload_from_body(request.body_text, &access.user_id) {
        Ok(payload) => payload,
        Err(response) => return *response,
    };
    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &[("select", "*".to_owned())])
    else {
        return changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE);
    };
    let Ok(body) = serde_json::to_string(&payload) else {
        return changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        ChangelogAuthenticatedRequest {
            method: OutboundMethod::Post,
            url: &url,
            accept: POSTGREST_SINGLE_JSON,
            access_token: &access.access_token,
            prefer: Some("return=representation"),
            body: Some(&body),
        },
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return if is_postgrest_error_code(&response, POSTGREST_DUPLICATE_KEY_CODE) {
            changelog_message_response(409, CHANGELOG_DUPLICATE_SLUG_MESSAGE)
        } else {
            changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE)
        };
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(201, body)),
        Err(_) => changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE),
    }
}

pub(super) async fn changelog_update_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };
    let payload = match update_changelog_payload_from_body(request.body_text) {
        Ok(payload) => payload,
        Err(response) => return *response,
    };

    match changelog_existing_entry(contact_data, &access.access_token, id, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return changelog_error_response(404),
        Err(()) => return changelog_error_response(404),
    }

    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{id}"))],
    ) else {
        return changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE);
    };
    let Ok(body) = serde_json::to_string(&payload) else {
        return changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        ChangelogAuthenticatedRequest {
            method: OutboundMethod::Patch,
            url: &url,
            accept: POSTGREST_SINGLE_JSON,
            access_token: &access.access_token,
            prefer: Some("return=representation"),
            body: Some(&body),
        },
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return if is_postgrest_error_code(&response, POSTGREST_DUPLICATE_KEY_CODE) {
            changelog_message_response(409, CHANGELOG_DUPLICATE_SLUG_MESSAGE)
        } else {
            changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE)
        };
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE),
    }
}

pub(super) async fn changelog_delete_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };

    match changelog_existing_entry(contact_data, &access.access_token, id, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return changelog_error_response(404),
        Err(()) => return changelog_error_response(404),
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &[("id", format!("eq.{id}"))])
    else {
        return changelog_message_response(500, CHANGELOG_DELETE_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        ChangelogAuthenticatedRequest {
            method: OutboundMethod::Delete,
            url: &url,
            accept: APPLICATION_JSON,
            access_token: &access.access_token,
            prefer: None,
            body: None,
        },
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_DELETE_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return changelog_message_response(500, CHANGELOG_DELETE_ERROR_MESSAGE);
    }

    no_store_response(json_response(
        200,
        json!({
            "message": CHANGELOG_DELETE_SUCCESS_MESSAGE,
        }),
    ))
}

pub(super) async fn changelog_publish_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };
    let is_published = match publish_changelog_input_from_body(request.body_text) {
        Ok(is_published) => is_published,
        Err(response) => return *response,
    };
    let existing_entry =
        match changelog_existing_entry(contact_data, &access.access_token, id, outbound).await {
            Ok(Some(entry)) => entry,
            Ok(None) => return changelog_error_response(404),
            Err(()) => return changelog_error_response(404),
        };
    let payload = publish_changelog_payload(is_published, &existing_entry);
    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{id}"))],
    ) else {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    };
    let Ok(body) = serde_json::to_string(&payload) else {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        ChangelogAuthenticatedRequest {
            method: OutboundMethod::Patch,
            url: &url,
            accept: POSTGREST_SINGLE_JSON,
            access_token: &access.access_token,
            prefer: Some("return=representation"),
            body: Some(&body),
        },
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE),
    }
}

pub(super) async fn changelog_list_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_list_error_response();
    }

    let query = changelog_list_query_from_url(request.url);
    let authorized = request_has_changelog_admin_access(contact_data, request, outbound).await;
    let mut params = vec![
        ("select", "*".to_owned()),
        (
            "order",
            "published_at.desc.nullslast,created_at.desc".to_owned(),
        ),
    ];

    if !authorized {
        params.extend(public_changelog_filters());
    } else if let Some(published) = query.published {
        params.push(("is_published", format!("eq.{published}")));
    }

    if let Some(category) = &query.category {
        params.push(("category", format!("eq.{category}")));
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &params) else {
        return changelog_list_error_response();
    };
    let range = changelog_range(&query);
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        APPLICATION_JSON,
        Some(&range),
        Some("count=exact"),
    )
    .await
    else {
        return changelog_list_error_response();
    };

    if !(200..300).contains(&response.status) {
        return changelog_list_error_response();
    }

    let Ok(data) = response.json::<Value>() else {
        return changelog_list_error_response();
    };
    let total = total_count_from_content_range(&response).unwrap_or(0);
    let total_pages = changelog_total_pages(total, query.page_size);

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "pagination": {
                "page": query.page,
                "pageSize": query.page_size,
                "total": total,
                "totalPages": total_pages,
            },
        }),
    ))
}

pub(super) async fn changelog_detail_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let authorized = request_has_changelog_admin_access(contact_data, request, outbound).await;
    let mut params = vec![("select", "*".to_owned()), ("id", format!("eq.{id}"))];

    if !authorized {
        params.extend(public_changelog_filters());
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &params) else {
        return changelog_error_response(500);
    };
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        POSTGREST_SINGLE_JSON,
        None,
        None,
    )
    .await
    else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}

pub(super) async fn changelog_slug_response(
    contact_data: &contact::ContactDataConfig,
    slug: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[
            ("select", "*".to_owned()),
            ("slug", format!("eq.{slug}")),
            ("is_published", "eq.true".to_owned()),
            ("published_at", "not.is.null".to_owned()),
        ],
    ) else {
        return changelog_error_response(500);
    };
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        POSTGREST_SINGLE_JSON,
        None,
        None,
    )
    .await
    else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}
