use super::*;

pub(super) enum AuthenticatedSupabaseUser {
    User(Value),
    Unauthorized,
    InternalError,
}

pub(super) async fn authenticated_supabase_user_value(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> AuthenticatedSupabaseUser {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return AuthenticatedSupabaseUser::Unauthorized;
    };

    match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(user)) => AuthenticatedSupabaseUser::User(user),
        Ok(None) => AuthenticatedSupabaseUser::Unauthorized,
        Err(()) => AuthenticatedSupabaseUser::InternalError,
    }
}

pub(super) async fn auth_mfa_assurance_level_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    let user = match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(user)) => user,
        Ok(None) => return unauthorized_response(),
        Err(()) => return internal_server_error_response(),
    };

    let Ok(assurance_level) = authenticator_assurance_level(&access_token, &user) else {
        return internal_server_error_response();
    };

    no_store_response(json_response(200, assurance_level))
}

pub(super) async fn auth_mfa_totp_factors_get_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let user = match authenticated_supabase_user_value(contact_data, request, outbound).await {
        AuthenticatedSupabaseUser::User(user) => user,
        AuthenticatedSupabaseUser::Unauthorized => return unauthorized_response(),
        AuthenticatedSupabaseUser::InternalError => return internal_server_error_response(),
    };

    let Ok(factors) = list_factors_from_user(&user) else {
        return internal_server_error_response();
    };

    no_store_response(json_response(200, factors))
}

pub(super) async fn auth_mfa_totp_factors_post_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return unauthorized_response(),
        Err(()) => return internal_server_error_response(),
    }

    let Ok(body) = totp_enroll_request_body(request.body_text) else {
        return internal_server_error_response();
    };

    let mut data = match send_supabase_auth_request(
        contact_data,
        &access_token,
        outbound,
        OutboundMethod::Post,
        SUPABASE_AUTH_FACTORS_PATH,
        Some(&body),
    )
    .await
    {
        Ok(data) => data,
        Err(SupabaseAuthRequestError::Api(message)) => {
            return supabase_auth_api_error_response(message);
        }
        Err(SupabaseAuthRequestError::Internal) => return internal_server_error_response(),
    };

    normalize_totp_enroll_response(&mut data);

    no_store_response(json_response(200, data))
}

pub(super) async fn auth_mfa_totp_factor_delete_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    factor_id: &str,
) -> BackendResponse {
    if let Some(response) = missing_factor_id_response(factor_id) {
        return response;
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return unauthorized_response();
    };

    match fetch_supabase_auth_user_value(contact_data, &access_token, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return unauthorized_response(),
        Err(()) => return internal_server_error_response(),
    }

    let path = format!("{SUPABASE_AUTH_FACTORS_PATH}/{factor_id}");
    let data = match send_supabase_auth_request(
        contact_data,
        &access_token,
        outbound,
        OutboundMethod::Delete,
        &path,
        None,
    )
    .await
    {
        Ok(data) => data,
        Err(SupabaseAuthRequestError::Api(message)) => {
            return supabase_auth_api_error_response(message);
        }
        Err(SupabaseAuthRequestError::Internal) => return internal_server_error_response(),
    };

    no_store_response(json_response(
        200,
        json!({
            "message": FACTOR_UNENROLLED_MESSAGE,
            "data": data,
        }),
    ))
}

pub(super) async fn auth_mfa_totp_factor_get_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
    factor_id: &str,
) -> BackendResponse {
    if let Some(response) = missing_factor_id_response(factor_id) {
        return response;
    }

    let user = match authenticated_supabase_user_value(contact_data, request, outbound).await {
        AuthenticatedSupabaseUser::User(user) => user,
        AuthenticatedSupabaseUser::Unauthorized => return unauthorized_response(),
        AuthenticatedSupabaseUser::InternalError => return internal_server_error_response(),
    };

    let Ok(factors) = list_factors_from_user(&user) else {
        return internal_server_error_response();
    };
    let factor = factors
        .get(FACTOR_TYPE_TOTP)
        .and_then(Value::as_array)
        .and_then(|factors| {
            factors.iter().find(|factor| {
                factor
                    .get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| id == factor_id)
            })
        });

    if let Some(factor) = factor {
        no_store_response(json_response(200, factor.clone()))
    } else {
        no_store_response(json_response(
            404,
            json!({
                "error": FACTOR_NOT_FOUND_MESSAGE,
            }),
        ))
    }
}
