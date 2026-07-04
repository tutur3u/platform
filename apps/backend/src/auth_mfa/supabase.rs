use super::*;

pub(super) async fn fetch_supabase_auth_user_value(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let user_url = contact_data.auth_url(SUPABASE_AUTH_USER_PATH).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &user_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    response.json::<Value>().map(Some).map_err(|_| ())
}

pub(super) async fn send_supabase_auth_request(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    path: &str,
    body: Option<&str>,
) -> Result<Value, SupabaseAuthRequestError> {
    let url = contact_data
        .auth_url(path)
        .ok_or(SupabaseAuthRequestError::Internal)?;
    let service_role_key = contact_data
        .service_role_key()
        .ok_or(SupabaseAuthRequestError::Internal)?;
    let authorization = format!("Bearer {access_token}");
    let mut request = OutboundRequest::new(method, &url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("X-Supabase-Api-Version", SUPABASE_AUTH_API_VERSION);

    if method != OutboundMethod::Get {
        request = request.with_header("Content-Type", JSON_UTF8_CONTENT_TYPE);
    }

    if let Some(body) = body {
        request = request.with_body(body);
    }

    let response = outbound
        .send(request)
        .await
        .map_err(|_| SupabaseAuthRequestError::Internal)?;

    if !(200..300).contains(&response.status) {
        let error_body = response
            .json::<Value>()
            .map_err(|_| SupabaseAuthRequestError::Internal)?;

        return Err(SupabaseAuthRequestError::Api(supabase_auth_error_message(
            &error_body,
        )));
    }

    response
        .json::<Value>()
        .map_err(|_| SupabaseAuthRequestError::Internal)
}

pub(super) fn supabase_auth_error_message(error_body: &Value) -> String {
    for key in ["msg", "message", "error_description", "error"] {
        if let Some(message) = error_body.get(key).and_then(Value::as_str) {
            return message.to_owned();
        }
    }

    serde_json::to_string(error_body).unwrap_or_else(|_| INTERNAL_SERVER_ERROR_MESSAGE.to_owned())
}
