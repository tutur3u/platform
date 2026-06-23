use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    email_blacklist::{
        EMAIL_BLACKLIST_TABLE, POSTGREST_SINGLE_JSON, authorize_email_blacklist_read,
        email_blacklist_entry_exists, is_success_status,
    },
    email_blacklist_validation::{
        EmailBlacklistBodyError, EmailBlacklistCreateInput, EmailBlacklistEntryType,
        EmailBlacklistUpdateInput, create_input_from_body, internal_server_error_response,
        invalid_request_data_response, is_valid_blacklist_domain, is_valid_blacklist_email,
        update_input_from_body,
    },
    infrastructure_root_auth::{
        RootWorkspaceReadAccess, RootWorkspaceReadAuthError, authorize_root_workspace_read_access,
    },
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const POSTGREST_DUPLICATE_ERROR_CODE: &str = "23505";

pub(crate) async fn email_blacklist_create_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match authorize_root_workspace_read_access(config, request, outbound).await {
        Ok(access) => access,
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Forbidden" })));
        }
    };

    let input = match create_input_from_body(request.body_text) {
        Ok(input) => input,
        Err(EmailBlacklistBodyError::InvalidRequest(errors)) => {
            return invalid_request_data_response(errors);
        }
        Err(EmailBlacklistBodyError::Internal) => return internal_server_error_response(),
    };

    match input.entry_type {
        EmailBlacklistEntryType::Email if !is_valid_blacklist_email(&input.value) => {
            return no_store_response(json_response(
                400,
                json!({ "message": "Invalid email address format" }),
            ));
        }
        EmailBlacklistEntryType::Domain if !is_valid_blacklist_domain(&input.value) => {
            return no_store_response(json_response(
                400,
                json!({ "message": "Invalid domain format" }),
            ));
        }
        _ => {}
    }

    let response =
        match create_email_blacklist_entry(&config.contact_data, outbound, &access, input).await {
            Ok(response) => response,
            Err(()) => {
                return no_store_response(json_response(
                    500,
                    json!({ "message": "Error creating email blacklist entry" }),
                ));
            }
        };

    if !is_success_status(response.status) {
        if is_postgrest_duplicate(&response) {
            return no_store_response(json_response(
                409,
                json!({ "message": "This entry already exists in the blacklist" }),
            ));
        }

        return no_store_response(json_response(
            500,
            json!({ "message": "Error creating email blacklist entry" }),
        ));
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(201, body)),
        Err(_) => no_store_response(json_response(
            500,
            json!({ "message": "Error creating email blacklist entry" }),
        )),
    }
}

pub(crate) async fn email_blacklist_update_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    entry_id: &str,
) -> BackendResponse {
    let access_token = match authorize_email_blacklist_read(config, request, outbound).await {
        Ok(access_token) => access_token,
        Err(RootWorkspaceReadAuthError::Unauthorized) => {
            return no_store_response(json_response(401, json!({ "message": "Unauthorized" })));
        }
        Err(RootWorkspaceReadAuthError::Forbidden) => {
            return no_store_response(json_response(403, json!({ "message": "Unauthorized" })));
        }
    };

    let input = match update_input_from_body(request.body_text) {
        Ok(input) => input,
        Err(EmailBlacklistBodyError::InvalidRequest(errors)) => {
            return invalid_request_data_response(errors);
        }
        Err(EmailBlacklistBodyError::Internal) => return internal_server_error_response(),
    };

    if !email_blacklist_entry_exists(&config.contact_data, outbound, &access_token, entry_id).await
    {
        return no_store_response(json_response(
            404,
            json!({ "message": "Email blacklist entry not found" }),
        ));
    }

    let response = match update_email_blacklist_entry(
        &config.contact_data,
        outbound,
        &access_token,
        entry_id,
        input,
    )
    .await
    {
        Ok(response) => response,
        Err(()) => {
            return no_store_response(json_response(
                500,
                json!({ "message": "Error updating email blacklist entry" }),
            ));
        }
    };

    if !is_success_status(response.status) {
        return no_store_response(json_response(
            500,
            json!({ "message": "Error updating email blacklist entry" }),
        ));
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => no_store_response(json_response(
            500,
            json!({ "message": "Error updating email blacklist entry" }),
        )),
    }
}

async fn create_email_blacklist_entry(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access: &RootWorkspaceReadAccess,
    input: EmailBlacklistCreateInput,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(EMAIL_BLACKLIST_TABLE, &[("select", "*".to_owned())])
    else {
        return Err(());
    };
    let mut payload = Map::new();
    payload.insert(
        "entry_type".to_owned(),
        Value::String(input.entry_type.as_str().to_owned()),
    );
    payload.insert("value".to_owned(), Value::String(input.value));
    payload.insert(
        "added_by_user_id".to_owned(),
        Value::String(access.user_id.clone()),
    );
    if let Some(reason) = input.reason {
        payload.insert("reason".to_owned(), Value::String(reason));
    }
    let body = serde_json::to_string(&Value::Object(payload)).map_err(|_| ())?;

    send_caller_token_json_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        &access.access_token,
        &body,
    )
    .await
}

async fn update_email_blacklist_entry(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    entry_id: &str,
    input: EmailBlacklistUpdateInput,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rest_url(
        EMAIL_BLACKLIST_TABLE,
        &[("id", format!("eq.{entry_id}")), ("select", "*".to_owned())],
    ) else {
        return Err(());
    };
    let mut payload = Map::new();
    if input.reason_present {
        payload.insert(
            "reason".to_owned(),
            input.reason.map(Value::String).unwrap_or(Value::Null),
        );
    }
    let body = serde_json::to_string(&Value::Object(payload)).map_err(|_| ())?;

    send_caller_token_json_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        access_token,
        &body,
    )
    .await
}

async fn send_caller_token_json_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    access_token: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(method, url)
                .with_header("Accept", POSTGREST_SINGLE_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "return=representation")
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(body),
        )
        .await
        .map_err(|_| ())
}

fn is_postgrest_duplicate(response: &OutboundResponse) -> bool {
    response
        .json::<Value>()
        .ok()
        .and_then(|body| body.get("code").and_then(Value::as_str).map(str::to_owned))
        .as_deref()
        == Some(POSTGREST_DUPLICATE_ERROR_CODE)
}
