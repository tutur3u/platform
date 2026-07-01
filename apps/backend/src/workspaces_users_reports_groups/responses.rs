use super::*;

pub(super) fn not_found_response() -> BackendResponse {
    no_store_response(json_response(404, json!({ "error": "Not found" })))
}

pub(super) fn unauthorized_response() -> BackendResponse {
    no_store_response(json_response(403, json!({ "message": "Unauthorized" })))
}

pub(super) fn error_fetching_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Error fetching report groups" }),
    ))
}

pub(super) fn internal_server_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "message": "Internal server error" }),
    ))
}
