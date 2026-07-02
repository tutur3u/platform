use super::*;

pub(super) fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(
        401,
        json!({
            "error": UNAUTHORIZED_MESSAGE,
        }),
    ))
}

pub(super) fn missing_factor_id_response(factor_id: &str) -> Option<BackendResponse> {
    factor_id.trim().is_empty().then(|| {
        no_store_response(json_response(
            400,
            json!({
                "error": MISSING_FACTOR_ID_MESSAGE,
            }),
        ))
    })
}

pub(super) fn supabase_auth_api_error_response(message: String) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "error": message,
        }),
    ))
}

pub(super) fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "error": INTERNAL_SERVER_ERROR_MESSAGE,
        }),
    ))
}
