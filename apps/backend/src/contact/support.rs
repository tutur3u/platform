use super::*;

#[derive(Deserialize)]
struct SupportInquiryRequest {
    email: String,
    message: String,
    name: String,
    product: String,
    subject: String,
    #[serde(rename = "type")]
    inquiry_type: String,
}

#[derive(Deserialize)]
struct SupportInquiryInsertRow {
    id: String,
}

#[derive(Serialize)]
struct SupportInquiryInsert<'a> {
    creator_id: &'a str,
    email: &'a str,
    message: &'a str,
    name: &'a str,
    product: &'a str,
    subject: &'a str,
    #[serde(rename = "type")]
    inquiry_type: &'a str,
}

pub(crate) fn support_inquiry_post_response(
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
                "message": "Support inquiry creation requires same-origin confirmation",
            }),
        ));
    }

    let Some(body) = parse_json_body(request.body_text) else {
        return no_store_response(invalid_contact_request_body_response(vec![
            "body must be valid JSON".to_owned(),
        ]));
    };

    let mut payload = match serde_json::from_value::<SupportInquiryRequest>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return no_store_response(invalid_contact_request_body_response(vec![
                "body must include name, email, type, product, subject, and message".to_owned(),
            ]));
        }
    };

    payload.message = payload.message.trim().to_owned();
    let validation_errors = validate_support_inquiry_payload(&payload);
    if !validation_errors.is_empty() {
        return no_store_response(invalid_contact_request_body_response(validation_errors));
    }

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    contact_data_layer_not_ready_response(request)
}

pub(super) async fn support_inquiry_data_post_response(
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
                "message": "Support inquiry creation requires same-origin confirmation",
            }),
        ));
    }

    let Some(body) = parse_json_body(request.body_text) else {
        return no_store_response(invalid_contact_request_body_response(vec![
            "body must be valid JSON".to_owned(),
        ]));
    };

    let mut payload = match serde_json::from_value::<SupportInquiryRequest>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return no_store_response(invalid_contact_request_body_response(vec![
                "body must include name, email, type, product, subject, and message".to_owned(),
            ]));
        }
    };

    payload.message = payload.message.trim().to_owned();
    let validation_errors = validate_support_inquiry_payload(&payload);
    if !validation_errors.is_empty() {
        return no_store_response(invalid_contact_request_body_response(validation_errors));
    }

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    let Some(inquiries_url) = config
        .contact_data
        .rest_url("support_inquiries", &[("select", "id".to_owned())])
    else {
        return contact_data_layer_not_ready_response(request);
    };
    let insert = SupportInquiryInsert {
        creator_id: &actor.claims.sub,
        email: &payload.email,
        message: &payload.message,
        name: &payload.name,
        product: &payload.product,
        subject: &payload.subject,
        inquiry_type: &payload.inquiry_type,
    };
    let body = match serde_json::to_string(&insert) {
        Ok(body) => body,
        Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Internal server error" }),
            ));
        }
    };

    let response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Post,
        &inquiries_url,
        Some(&body),
        Some("return=representation"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to create inquiry" }),
            ));
        }
    };

    let inserted = match decode_first_row::<SupportInquiryInsertRow>(&response) {
        Ok(Some(row)) => row,
        Ok(None) | Err(_) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Failed to create inquiry" }),
            ));
        }
    };

    no_store_response(json_response(
        201,
        json!({
            "success": true,
            "inquiryId": inserted.id,
        }),
    ))
}

pub(super) async fn support_inquiry_data_patch_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let updates = match support_inquiry_patch_updates(request.body_text) {
        Ok(updates) => updates,
        Err(response) => return no_store_response(*response),
    };

    if !config.contact_data.configured() {
        return contact_data_layer_not_ready_response(request);
    }

    if request.cookie.is_some()
        && !request
            .authorization
            .and_then(|value| value.strip_prefix("Bearer "))
            .is_some_and(|token| !token.trim().is_empty())
        && !is_same_origin_api_request(request)
    {
        return no_store_response(json_response(
            403,
            json!({ "message": "Support inquiry updates require same-origin confirmation" }),
        ));
    }
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return support_inquiry_admin_unauthorized_response();
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return support_inquiry_admin_unauthorized_response();
    };

    if !supabase_auth::is_valid_tuturuuu_email(user.email.as_deref()) {
        return support_inquiry_admin_unauthorized_response();
    }

    let Some(inquiry_url) = config
        .contact_data
        .rest_url("support_inquiries", &[("id", format!("eq.{id}"))])
    else {
        return contact_data_layer_not_ready_response(request);
    };
    let body = match serde_json::to_string(&updates) {
        Ok(body) => body,
        Err(_) => return support_inquiry_internal_server_error_response(),
    };

    let response = match send_contact_data_request(
        &config.contact_data,
        outbound,
        OutboundMethod::Patch,
        &inquiry_url,
        Some(&body),
        Some("return=representation"),
    )
    .await
    {
        Ok(response) if is_success_status(response.status) => response,
        Ok(_) | Err(_) => return support_inquiry_update_failed_response(),
    };

    let data = match decode_first_row::<serde_json::Value>(&response) {
        Ok(Some(row)) => row,
        Ok(None) | Err(_) => return support_inquiry_update_failed_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "data": data,
        }),
    ))
}

fn invalid_contact_request_body_response(errors: Vec<String>) -> BackendResponse {
    json_response(
        400,
        json!({
            "errors": errors,
            "message": "Invalid request body",
        }),
    )
}

fn support_inquiry_patch_updates(
    body_text: Option<&str>,
) -> Result<serde_json::Value, Box<BackendResponse>> {
    let Some(body) = parse_json_body(body_text) else {
        return Err(Box::new(support_inquiry_internal_server_error_response()));
    };
    let Some(body) = body.as_object() else {
        return Err(Box::new(invalid_support_inquiry_update_response(vec![
            json!({
                "path": [],
                "message": "Expected object",
            }),
        ])));
    };
    let mut updates = serde_json::Map::new();
    let mut errors = Vec::new();

    for field in ["is_read", "is_resolved"] {
        match body.get(field) {
            Some(value) if value.is_boolean() => {
                updates.insert(field.to_owned(), value.clone());
            }
            Some(_) => errors.push(json!({
                "path": [field],
                "message": "Expected boolean",
            })),
            None => {}
        }
    }

    if !errors.is_empty() {
        return Err(Box::new(invalid_support_inquiry_update_response(errors)));
    }

    Ok(serde_json::Value::Object(updates))
}

fn invalid_support_inquiry_update_response(details: Vec<serde_json::Value>) -> BackendResponse {
    json_response(
        400,
        json!({
            "details": details,
            "error": "Invalid request body",
        }),
    )
}

fn support_inquiry_admin_unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": "Unauthorized. Only Tuturuuu accounts can update inquiries.",
        }),
    ))
}

fn support_inquiry_update_failed_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Failed to update inquiry",
        }),
    ))
}

fn support_inquiry_internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": "Internal server error",
        }),
    ))
}

fn validate_support_inquiry_payload(payload: &SupportInquiryRequest) -> Vec<String> {
    let mut errors = Vec::new();

    validate_string_length(&mut errors, "name", &payload.name, 2, 64);
    validate_email(&mut errors, &payload.email);
    validate_enum(
        &mut errors,
        "type",
        &payload.inquiry_type,
        &SUPPORT_INQUIRY_TYPES,
    );
    validate_enum(
        &mut errors,
        "product",
        &payload.product,
        &SUPPORT_INQUIRY_PRODUCTS,
    );
    validate_string_length(
        &mut errors,
        "subject",
        &payload.subject,
        5,
        MAX_SUPPORT_INQUIRY_SUBJECT_LENGTH,
    );
    validate_string_length(
        &mut errors,
        "message",
        payload.message.trim(),
        10,
        MAX_SUPPORT_INQUIRY_LENGTH,
    );

    errors
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn support_limits_match_current_database_constraints() {
        let mut value = SupportInquiryRequest {
            email: "synthetic@example.test".into(),
            message: "m".repeat(512),
            name: "n".repeat(64),
            product: "web".into(),
            subject: "s".repeat(128),
            inquiry_type: "support".into(),
        };
        assert!(validate_support_inquiry_payload(&value).is_empty());
        for field in ["name", "subject", "message"] {
            let mut unicode = SupportInquiryRequest {
                name: "😀".repeat(64),
                subject: "😀".repeat(128),
                message: "😀".repeat(512),
                email: value.email.clone(),
                product: value.product.clone(),
                inquiry_type: value.inquiry_type.clone(),
            };
            assert!(validate_support_inquiry_payload(&unicode).is_empty());
            match field {
                "name" => unicode.name.push('😀'),
                "subject" => unicode.subject.push('😀'),
                _ => unicode.message.push('😀'),
            }
            assert!(
                validate_support_inquiry_payload(&unicode)
                    .iter()
                    .any(|e| e.starts_with(field))
            );
        }
        value.message = " ".repeat(20);
        assert!(
            validate_support_inquiry_payload(&value)
                .iter()
                .any(|e| e.starts_with("message"))
        );
        value.message = "m".repeat(512);
        for field in ["name", "subject", "message"] {
            match field {
                "name" => value.name.push('n'),
                "subject" => value.subject.push('s'),
                _ => value.message.push('m'),
            }
            assert!(
                validate_support_inquiry_payload(&value)
                    .iter()
                    .any(|error| error.starts_with(field))
            );
            match field {
                "name" => {
                    value.name.pop();
                }
                "subject" => {
                    value.subject.pop();
                }
                _ => {
                    value.message.pop();
                }
            }
        }
    }
}
