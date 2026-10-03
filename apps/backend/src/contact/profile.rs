use super::*;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
struct CurrentUserProfileResponse {
    avatar_url: Option<String>,
    banner_url: Option<String>,
    bio: Option<String>,
    handle: Option<String>,
    created_at: String,
    default_workspace_id: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    full_name: Option<String>,
    id: String,
    new_email: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseUserRow {
    avatar_url: Option<String>,
    banner_url: Option<String>,
    bio: Option<String>,
    handle: Option<String>,
    created_at: Option<String>,
    display_name: Option<String>,
    id: Option<String>,
}

#[derive(Deserialize)]
struct SupabaseUserPrivateDetailsRow {
    default_workspace_id: Option<String>,
    email: Option<String>,
    full_name: Option<String>,
    new_email: Option<String>,
}

#[derive(Serialize)]
struct CurrentUserFullNameUpsert<'a> {
    user_id: &'a str,
    full_name: &'a str,
}

pub(super) async fn current_user_full_name_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Profile updates require same-origin confirmation",
            }),
        ));
    };

    let full_name = match full_name_from_body(request.body_text) {
        Ok(full_name) => full_name,
        Err(response) => return no_store_response(*response),
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(full_name_url) = config.contact_data.rest_url(
        "user_private_details",
        &[("on_conflict", "user_id".to_owned())],
    ) else {
        return contact_data_layer_not_ready_response(request);
    };
    let upsert = CurrentUserFullNameUpsert {
        user_id: &actor.claims.sub,
        full_name: &full_name,
    };
    let body = match serde_json::to_string(&upsert) {
        Ok(body) => body,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Post,
        &full_name_url,
        Some(&body),
        Some("resolution=merge-duplicates,return=minimal"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => no_store_response(json_response(
            200,
            json!({ "message": "Full name updated successfully" }),
        )),
        Ok(_) | Err(_) => no_store_response(json_response(
            500,
            json!({ "message": "Error updating full name" }),
        )),
    }
}

pub(crate) fn current_user_profile_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    no_store_response(json_response(
        200,
        CurrentUserProfileResponse {
            avatar_url: None,
            banner_url: None,
            bio: None,
            handle: None,
            created_at: unix_seconds_to_iso8601(actor.claims.iat),
            default_workspace_id: None,
            display_name: None,
            email: actor.claims.email,
            full_name: None,
            id: actor.claims.sub,
            new_email: None,
        },
    ))
}

pub(super) async fn current_user_profile_data_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(user_url) = config.contact_data.rest_url(
        "users",
        &[
            (
                "select",
                "id,display_name,avatar_url,banner_url,bio,handle,created_at".to_owned(),
            ),
            ("id", format!("eq.{}", actor.claims.sub)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return contact_data_layer_not_ready_response(request);
    };
    let Some(private_details_url) = config.contact_data.rest_url(
        "user_private_details",
        &[
            (
                "select",
                "full_name,new_email,email,default_workspace_id".to_owned(),
            ),
            ("user_id", format!("eq.{}", actor.claims.sub)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return contact_data_layer_not_ready_response(request);
    };

    let user_response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Get,
        &user_url,
        None,
        None,
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(response)
            if matches!(
                postgrest_code(&response).as_deref(),
                Some("42703" | "PGRST204")
            ) =>
        {
            let Some(url) = config.contact_data.rest_url(
                "users",
                &[
                    (
                        "select",
                        "id,display_name,avatar_url,bio,handle,created_at".to_owned(),
                    ),
                    ("id", format!("eq.{}", actor.claims.sub)),
                    ("limit", "1".to_owned()),
                ],
            ) else {
                return contact_data_layer_not_ready_response(request);
            };
            match send_contact_data_request(
                &config.contact_data,
                outbound,
                OutboundMethod::Get,
                &url,
                None,
                None,
            )
            .await
            {
                Ok(response) if is_success_status(response.status) => response,
                _ => {
                    return no_store_response(json_response(
                        500,
                        json!({ "message": "Error fetching user profile" }),
                    ));
                }
            }
        }
        Ok(_) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching user profile" }),
            ));
        }
    };
    let private_details_response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Get,
        &private_details_url,
        None,
        None,
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching user profile" }),
            ));
        }
    };

    let user_row = match decode_first_row::<SupabaseUserRow>(&user_response) {
        Ok(row) => row,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error fetching user profile" }),
            ));
        }
    };
    let private_details_row =
        match decode_first_row::<SupabaseUserPrivateDetailsRow>(&private_details_response) {
            Ok(row) => row,
            Err(_) => {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error fetching user profile" }),
                ));
            }
        };

    no_store_response(json_response(
        200,
        CurrentUserProfileResponse {
            avatar_url: user_row.as_ref().and_then(|row| row.avatar_url.clone()),
            banner_url: user_row.as_ref().and_then(|row| row.banner_url.clone()),
            bio: user_row.as_ref().and_then(|row| row.bio.clone()),
            handle: user_row.as_ref().and_then(|row| row.handle.clone()),
            created_at: user_row
                .as_ref()
                .and_then(|row| row.created_at.clone())
                .unwrap_or_else(|| unix_seconds_to_iso8601(actor.claims.iat)),
            default_workspace_id: private_details_row
                .as_ref()
                .and_then(|row| row.default_workspace_id.clone()),
            display_name: user_row.as_ref().and_then(|row| row.display_name.clone()),
            email: private_details_row
                .as_ref()
                .and_then(|row| row.email.clone())
                .or(actor.claims.email),
            full_name: private_details_row
                .as_ref()
                .and_then(|row| row.full_name.clone()),
            id: user_row.and_then(|row| row.id).unwrap_or(actor.claims.sub),
            new_email: private_details_row.and_then(|row| row.new_email),
        },
    ))
}

pub(crate) fn current_user_profile_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Profile updates require same-origin confirmation",
            }),
        ));
    }

    contact_data_layer_not_ready_response(request)
}

pub(super) async fn current_user_profile_patch_data_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let actor =
        match session::resolve_app_session(config, request, &CURRENT_USER_APP_SESSION_TARGETS) {
            Ok(actor) => actor,
            Err(response) => return no_store_response(*response),
        };

    if actor.source == session::AppSessionAuthSource::Cookie && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({
                "message": "Profile updates require same-origin confirmation",
            }),
        ));
    }

    let mut updates = match profile_patch_updates(request.body_text) {
        Ok(updates) => updates,
        Err(response) => return no_store_response(*response),
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    if let Some(original) = updates.get("handle").and_then(|value| value.as_str()) {
        let normalized = original.trim().to_lowercase();
        if original != normalized || !valid_new_handle(&normalized) {
            let Some(url) = config.contact_data.rest_url(
                "users",
                &[
                    ("select", "handle".to_owned()),
                    ("id", format!("eq.{}", actor.claims.sub)),
                    ("limit", "1".to_owned()),
                ],
            ) else {
                return contact_data_layer_not_ready_response(request);
            };
            let response = send_contact_data_request(
                &config.contact_data,
                outbound,
                OutboundMethod::Get,
                &url,
                None,
                None,
            )
            .await;
            let rows = match response {
                Ok(response) if is_success_status(response.status) => {
                    serde_json::from_str::<Vec<serde_json::Value>>(&response.body_text).ok()
                }
                _ => None,
            };
            let Some(rows) = rows else {
                return no_store_response(json_response(
                    503,
                    json!({ "message": "Unable to verify current username" }),
                ));
            };
            let current = rows
                .first()
                .and_then(|row| row.get("handle"))
                .and_then(|value| value.as_str());
            let Some(handle) = resolve_handle_update(original, current) else {
                return no_store_response(json_response(
                    400,
                    json!({ "message": "Invalid request data" }),
                ));
            };
            updates["handle"] = json!(handle);
        }
    }

    let Some(profile_url) = config.contact_data.rpc_url("update_public_user_profile") else {
        return contact_data_layer_not_ready_response(request);
    };
    let body = match serde_json::to_string(
        &json!({ "p_user_id": actor.claims.sub, "p_patch": updates }),
    ) {
        Ok(body) => body,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Post,
        &profile_url,
        Some(&body),
        Some("return=minimal"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => no_store_response(json_response(
            200,
            json!({ "message": "Profile updated successfully" }),
        )),
        Ok(response) => {
            let code = postgrest_code(&response);
            if matches!(code.as_deref(), Some("42883" | "PGRST202")) {
                if updates.get("handle").is_some()
                    || updates.get("banner_url").is_some()
                    || updates.get("display_name").is_some()
                {
                    return no_store_response(json_response(
                        503,
                        json!({ "message": "Profile identity upgrade is pending" }),
                    ));
                }
                let Some(url) = config
                    .contact_data
                    .rest_url("users", &[("id", format!("eq.{}", actor.claims.sub))])
                else {
                    return contact_data_layer_not_ready_response(request);
                };
                let legacy_body = updates.to_string();
                return match send_contact_data_request(
                    &config.contact_data,
                    outbound,
                    OutboundMethod::Patch,
                    &url,
                    Some(&legacy_body),
                    Some("return=minimal"),
                )
                .await
                {
                    Ok(response) if is_success_status(response.status) => no_store_response(
                        json_response(200, json!({ "message": "Profile updated successfully" })),
                    ),
                    _ => no_store_response(json_response(
                        500,
                        json!({ "message": "Internal server error" }),
                    )),
                };
            }
            if code.as_deref() == Some("PT429") {
                return profile_change_limit_response(&response);
            }
            let (status, message) = match code.as_deref() {
                Some("23505") => (409, "Username is unavailable"),
                Some("22023") => (400, "Invalid request data"),
                Some("P0002") => (404, "Profile not found"),
                _ => (500, "Internal server error"),
            };
            no_store_response(json_response(status, json!({ "message": message })))
        }
        Err(_) => no_store_response(json_response(
            500,
            json!({ "message": "Internal server error" }),
        )),
    }
}

fn profile_patch_updates(
    body_text: Option<&str>,
) -> Result<serde_json::Value, Box<BackendResponse>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(Box::new(invalid_profile_request_body_response(vec![
            "body must be valid JSON".to_owned(),
        ])));
    };
    let Some(body) = body.as_object() else {
        return Err(Box::new(invalid_profile_request_body_response(vec![
            "body must be a JSON object".to_owned(),
        ])));
    };
    let mut updates = serde_json::Map::new();
    let mut errors = Vec::new();

    if let Some(value) = body.get("display_name") {
        match value.as_str() {
            Some(display_name) => {
                validate_string_length(
                    &mut errors,
                    "display_name",
                    display_name,
                    1,
                    MAX_DISPLAY_NAME_LENGTH,
                );
                updates.insert("display_name".to_owned(), json!(display_name));
            }
            None => errors.push("display_name must be a string".to_owned()),
        }
    }

    if let Some(value) = body.get("bio") {
        if value.is_null() {
            updates.insert("bio".to_owned(), serde_json::Value::Null);
        } else if let Some(bio) = value.as_str() {
            validate_string_length(&mut errors, "bio", bio, 0, MAX_BIO_LENGTH);
            updates.insert("bio".to_owned(), json!(bio));
        } else {
            errors.push("bio must be a string or null".to_owned());
        }
    }

    for field in ["avatar_url", "banner_url"] {
        if let Some(value) = body.get(field) {
            if value.is_null() {
                updates.insert(field.to_owned(), serde_json::Value::Null);
            } else if let Some(image_url) = value.as_str() {
                if !url::Url::parse(image_url).is_ok_and(|url| url.scheme() == "https")
                    || image_url.len() > 2000
                {
                    errors.push(format!("{field} must be an HTTPS URL"));
                }
                updates.insert(field.to_owned(), json!(image_url));
            } else {
                errors.push(format!("{field} must be a URL string or null"));
            }
        }
    }
    if let Some(value) = body.get("handle") {
        if value.is_null() {
            updates.insert("handle".to_owned(), serde_json::Value::Null);
        } else if let Some(handle) = value.as_str() {
            if handle.chars().count() > 100 {
                errors.push("handle must be at most 100 characters".to_owned());
            }
            updates.insert("handle".to_owned(), json!(handle));
        } else {
            errors.push("handle must be a string or null".to_owned());
        }
    }

    if !errors.is_empty() {
        return Err(Box::new(invalid_profile_request_body_response(errors)));
    }

    if updates.is_empty() {
        return Err(Box::new(json_response(
            400,
            json!({ "message": "No valid fields to update" }),
        )));
    }

    Ok(serde_json::Value::Object(updates))
}

pub(super) fn full_name_from_body(body_text: Option<&str>) -> Result<String, Box<BackendResponse>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&[], "body must be valid JSON"),
        ])));
    };
    let Some(body) = body.as_object() else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&[], "body must be a JSON object"),
        ])));
    };
    let Some(value) = body.get("full_name") else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&["full_name"], "full_name is required"),
        ])));
    };
    let Some(full_name) = value.as_str() else {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(&["full_name"], "full_name must be a string"),
        ])));
    };

    let trimmed = full_name.trim();
    let length = trimmed.encode_utf16().count();
    if length < 1 {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(
                &["full_name"],
                "full_name must contain at least 1 characters",
            ),
        ])));
    }
    if length > MAX_FULL_NAME_LENGTH {
        return Err(Box::new(invalid_full_name_response(vec![
            validation_issue(
                &["full_name"],
                format!("full_name must contain at most {MAX_FULL_NAME_LENGTH} characters"),
            ),
        ])));
    }

    Ok(trimmed.to_owned())
}

pub(super) fn validation_issue(path: &[&str], message: impl Into<String>) -> serde_json::Value {
    json!({
        "message": message.into(),
        "path": path,
    })
}

fn invalid_full_name_response(errors: Vec<serde_json::Value>) -> BackendResponse {
    json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid full name",
        }),
    )
}

fn invalid_profile_request_body_response(errors: Vec<String>) -> BackendResponse {
    json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid request data",
        }),
    )
}

fn postgrest_code(response: &OutboundResponse) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(&response.body_text)
        .ok()
        .and_then(|body| {
            body.get("code")
                .and_then(|value| value.as_str())
                .map(str::to_owned)
        })
}

#[path = "username_policy.rs"]
mod username_policy;
use username_policy::profile_change_limit_response;
mod legacy_handle;
use legacy_handle::{resolve_handle_update, valid_new_handle};

#[cfg(test)]
#[path = "profile_tests.rs"]
mod tests;
