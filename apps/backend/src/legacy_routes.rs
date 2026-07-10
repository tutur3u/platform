//! legacy_routes helpers extracted from `lib.rs` (pure movement).

use crate::*;
use serde_json::json;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HealthResponse {
    environment: String,
    ok: bool,
    runtime: &'static str,
    service: String,
}

pub fn route_request(config: &BackendConfig, request: BackendRequest<'_>) -> BackendResponse {
    match (request.method, request.path) {
        ("GET", BROWSER_STATE_RECOVERY_PATH) => browser_state_recovery_page_response(),
        ("POST", BROWSER_STATE_RECOVERY_PATH) => browser_state_recovery_post_response(request),
        (method, BROWSER_STATE_RECOVERY_PATH) => method_not_allowed(method, "GET, POST"),
        ("POST", "/api/v1/infrastructure/languages") => language_cookie_post_response(request),
        ("DELETE", "/api/v1/infrastructure/languages") => {
            delete_cookie_success_response(LOCALE_COOKIE_NAME)
        }
        (method, "/api/v1/infrastructure/languages") => method_not_allowed(method, "POST, DELETE"),
        ("POST", "/api/v1/infrastructure/sidebar") => sidebar_cookie_post_response(request),
        ("DELETE", "/api/v1/infrastructure/sidebar") => {
            delete_cookie_success_response(SIDEBAR_COLLAPSED_COOKIE_NAME)
        }
        (method, "/api/v1/infrastructure/sidebar") => method_not_allowed(method, "POST, DELETE"),
        ("POST", "/api/v1/infrastructure/sidebar/sizes") => {
            sidebar_sizes_cookie_post_response(request)
        }
        ("DELETE", "/api/v1/infrastructure/sidebar/sizes") => {
            delete_cookie_success_response(SIDEBAR_SIZE_COOKIE_NAME)
        }
        (method, "/api/v1/infrastructure/sidebar/sizes") => {
            method_not_allowed(method, "POST, DELETE")
        }
        ("GET" | "POST", path) if is_workspace_slides_collection_path(path) => {
            not_implemented_response()
        }
        (method, path) if is_workspace_slides_collection_path(path) => {
            method_not_allowed(method, "GET, POST")
        }
        ("PUT" | "DELETE", path) if is_workspace_slide_item_path(path) => {
            not_implemented_response()
        }
        (method, path) if is_workspace_slide_item_path(path) => {
            method_not_allowed(method, "PUT, DELETE")
        }
        ("GET" | "HEAD", path) if is_well_known_path(path) => {
            empty_response_with_cache_control(404, WELL_KNOWN_CACHE_CONTROL)
        }
        (method, path) if is_well_known_path(path) => method_not_allowed(method, "GET, HEAD"),
        ("GET", path) if is_serwist_route_path(path) => serwist_route_response(path),
        (method, path) if is_serwist_route_path(path) => method_not_allowed(method, "GET"),
        ("GET", "/api/health") => json_response_with_cache_control(
            200,
            json!({
                "status": "ok",
            }),
            "no-store",
        ),
        (method, "/api/health") => method_not_allowed(method, "GET"),
        ("GET", "/api/v1/calendar/mock") => calendar_mock_response(),
        (method, "/api/v1/calendar/mock") => method_not_allowed(method, "GET"),
        ("GET", path) if is_retired_share_course_path(path) => {
            retired_legacy_api_response(RETIRED_SHARE_COURSE_MESSAGE)
        }
        (method, path) if is_retired_share_course_path(path) => method_not_allowed(method, "GET"),
        ("GET", "/api/sync-logs") => retired_legacy_api_response(RETIRED_SYNC_LOGS_MESSAGE),
        (method, "/api/sync-logs") => method_not_allowed(method, "GET"),
        ("GET", "/api/users/search") => retired_legacy_api_response(RETIRED_USER_SEARCH_MESSAGE),
        (method, "/api/users/search") => method_not_allowed(method, "GET"),
        ("GET", "/api/v1/proxy/tuturuuu") => {
            retired_legacy_api_response(RETIRED_TUTURUUU_PROXY_MESSAGE)
        }
        (method, "/api/v1/proxy/tuturuuu") => method_not_allowed(method, "GET"),
        ("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH) => {
            grouped_score_names_migration_response(config)
        }
        (method, GROUPED_SCORE_NAMES_MIGRATION_PATH) => method_not_allowed(method, "PUT"),
        (method, path) if is_obsolete_infrastructure_migration_method(method, path) => {
            obsolete_infrastructure_migration_response(config)
        }
        (method, path) if is_obsolete_infrastructure_migration_path(path) => method_not_allowed(
            method,
            obsolete_infrastructure_migration_allowed_methods(path).unwrap_or("PUT"),
        ),
        (method, path) if is_obsolete_workspace_migration_method(method, path) => {
            obsolete_workspace_migration_response(config)
        }
        (method, path) if is_obsolete_workspace_migration_path(path) => method_not_allowed(
            method,
            obsolete_workspace_migration_allowed_methods(path).unwrap_or("PUT"),
        ),
        (method, path) if is_retired_workspace_data_migration_method(method, path) => {
            let (_, message) = retired_workspace_data_migration_route(path)
                .unwrap_or(("GET", OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE));
            retired_workspace_data_migration_response(message)
        }
        (method, path) if is_retired_workspace_data_migration_path(path) => {
            let (allowed_methods, _) = retired_workspace_data_migration_route(path)
                .unwrap_or(("GET", OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE));
            method_not_allowed(method, allowed_methods)
        }
        ("GET", USER_FIELD_TYPES_PATH) => user_field_types_response(),
        (method, USER_FIELD_TYPES_PATH) => method_not_allowed(method, "GET"),
        ("GET", contact::CURRENT_USER_PROFILE_PATH) => {
            contact::current_user_profile_response(config, request)
        }
        ("PATCH", contact::CURRENT_USER_PROFILE_PATH) => {
            contact::current_user_profile_patch_response(config, request)
        }
        (method, contact::CURRENT_USER_PROFILE_PATH) => method_not_allowed(method, "GET, PATCH"),
        ("POST", contact::SUPPORT_INQUIRIES_PATH) => {
            contact::support_inquiry_post_response(config, request)
        }
        (method, contact::SUPPORT_INQUIRIES_PATH) => method_not_allowed(method, "POST"),
        ("OPTIONS", path) if is_auth_cors_preflight_path(path) => {
            mobile_auth_cors_preflight_response()
        }
        ("OPTIONS", path) if is_bare_auth_preflight_path(path) => empty_response(204),
        ("OPTIONS", path) if is_webgl_package_upload_path(path) => {
            webgl_package_upload_options_response(config, request)
        }
        ("POST", path) if is_group_check_email_path(path) => disabled_group_check_email_response(),
        (method, path) if is_group_check_email_path(path) => method_not_allowed(method, "POST"),
        ("GET", "/healthz") => json_response(
            200,
            HealthResponse {
                environment: config.environment.clone(),
                ok: true,
                runtime: "rust",
                service: config.service_name.clone(),
            },
        ),
        (method, "/healthz") => method_not_allowed(method, "GET"),
        ("GET", "/readyz") if config.ready() => json_response(
            200,
            json!({
                "ok": true,
                "runtime": "rust",
                "service": config.service_name,
            }),
        ),
        ("GET", "/readyz") => json_response(
            503,
            json!({
                "error": "BACKEND_INTERNAL_TOKEN is required",
                "ok": false,
                "service": config.service_name,
            }),
        ),
        (method, "/readyz") => method_not_allowed(method, "GET"),
        ("GET", "/api/migration/status") => migration_status_response(config, request),
        (method, "/api/migration/status") => method_not_allowed(method, "GET"),
        ("GET", "/api/migration/manifest") => migration_manifest_response(config, request),
        (method, "/api/migration/manifest") => method_not_allowed(method, "GET"),
        ("GET", "/api/migration/progress") => migration_progress_response(config, request),
        (method, "/api/migration/progress") => method_not_allowed(method, "GET"),
        ("GET", "/api/migration/cutover-gates") => {
            migration_cutover_gates_response(config, request)
        }
        (method, "/api/migration/cutover-gates") => method_not_allowed(method, "GET"),
        ("POST", path) if path.starts_with("/internal/jobs/") => handle_job(config, request, path),
        (method, path) if path.starts_with("/internal/jobs/") => method_not_allowed(method, "POST"),
        _ => json_response(404, json!({ "error": "not found" })),
    }
}

pub(crate) fn grouped_score_names_migration_response(config: &BackendConfig) -> BackendResponse {
    if let Some(response) = require_infrastructure_migration_dev_mode(config) {
        return response;
    }

    json_response(
        410,
        json!({
            "message": GROUPED_SCORE_NAMES_MIGRATION_DISABLED_MESSAGE,
            "error": "MIGRATION_DISABLED",
        }),
    )
}

pub(crate) fn obsolete_infrastructure_migration_response(
    config: &BackendConfig,
) -> BackendResponse {
    if let Some(response) = require_infrastructure_migration_dev_mode(config) {
        return response;
    }

    json_response(
        410,
        json!({
            "message": OBSOLETE_INFRASTRUCTURE_MIGRATION_DISABLED_MESSAGE,
            "error": "MIGRATION_DISABLED",
        }),
    )
}

pub(crate) fn obsolete_workspace_migration_response(config: &BackendConfig) -> BackendResponse {
    if let Some(response) = require_infrastructure_migration_dev_mode(config) {
        return response;
    }

    json_response(
        410,
        json!({
            "message": OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE,
            "error": "MIGRATION_DISABLED",
        }),
    )
}

pub(crate) fn retired_workspace_data_migration_response(message: &'static str) -> BackendResponse {
    json_response(
        410,
        json!({
            "message": message,
            "error": "MIGRATION_DISABLED",
        }),
    )
}

pub(crate) fn retired_legacy_api_response(message: &'static str) -> BackendResponse {
    json_response(
        410,
        json!({
            "message": message,
            "error": RETIRED_LEGACY_API_ERROR,
        }),
    )
}

pub(crate) fn require_infrastructure_migration_dev_mode(
    config: &BackendConfig,
) -> Option<BackendResponse> {
    if config
        .environment
        .trim()
        .eq_ignore_ascii_case("development")
        || config.local_e2e_migration_access
    {
        return None;
    }

    Some(json_response(
        403,
        json!({
            "error": "Forbidden",
            "message": "Infrastructure migration routes are only accessible in development mode",
            "hint": "These routes are intended for internal data migration and should not be used in production.",
        }),
    ))
}

pub(crate) fn require_internal_authorization(
    config: &BackendConfig,
    authorization: Option<&str>,
) -> Option<BackendResponse> {
    if !config.ready() {
        return Some(json_response(
            503,
            json!({
                "error": "backend internal token is not configured",
            }),
        ));
    }

    if !authorized(config, authorization) {
        return Some(json_response(401, json!({ "error": "unauthorized" })));
    }

    None
}

pub(crate) fn handle_job(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    path: &str,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    let job_name = path
        .trim_start_matches("/internal/jobs/")
        .trim_matches('/')
        .to_owned();
    let request_id = request
        .request_id
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .unwrap_or_else(generated_request_id);

    match job_name.as_str() {
        "noop" => json_response(
            202,
            json!({
                "accepted": true,
                "job": "noop",
                "requestId": request_id,
            }),
        ),
        _ => json_response(
            404,
            json!({
                "error": "unknown job",
                "job": job_name,
                "requestId": request_id,
            }),
        ),
    }
}

pub(crate) fn obsolete_workspace_migration_allowed_methods(path: &str) -> Option<&'static str> {
    let segments = path_segments(path);

    if segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && !segments[2].is_empty()
        && segments[3] == "wallets"
        && segments[4] == "migrate"
    {
        return Some("PUT");
    }

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && !segments[2].is_empty()
        && segments[5] == "migrate"
        && matches!(
            (segments[3], segments[4]),
            ("products", "categories")
                | ("products", "units")
                | ("transactions", "categories")
                | ("users", "indicators")
                | ("wallets", "transactions")
        )
    {
        return Some("PUT");
    }

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "workspaces"
        && !segments[2].is_empty()
        && segments[3] == "users"
        && segments[4] == "indicators"
        && segments[5] == "groups"
        && segments[6] == "migrate"
    {
        return Some("PUT");
    }

    None
}

pub(crate) fn retired_workspace_data_migration_route(
    path: &str,
) -> Option<(&'static str, &'static str)> {
    let segments = path_segments(path);

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "encryption"
        && segments[5] == "migrate"
    {
        return Some((
            "GET, POST",
            RETIRED_WORKSPACE_ENCRYPTION_MIGRATION_DISABLED_MESSAGE,
        ));
    }

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "storage"
        && segments[5] == "migrate"
    {
        return Some(("POST", RETIRED_WORKSPACE_STORAGE_MIGRATION_DISABLED_MESSAGE));
    }

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v2"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "migrate"
        && !segments[5].is_empty()
    {
        return Some(("GET", RETIRED_WORKSPACE_EXPORT_MIGRATION_DISABLED_MESSAGE));
    }

    None
}

pub(crate) fn obsolete_infrastructure_migration_allowed_methods(
    path: &str,
) -> Option<&'static str> {
    let segments = path_segments(path);

    if segments.len() != 5
        || segments[0] != "api"
        || segments[1] != "v1"
        || segments[2] != "infrastructure"
        || segments[3] != "migrate"
    {
        return None;
    }

    let slug = segments[4];

    if OBSOLETE_INFRASTRUCTURE_MIGRATION_POST_ONLY.contains(&slug) {
        Some("POST")
    } else if OBSOLETE_INFRASTRUCTURE_MIGRATION_GET_PUT_PATCH.contains(&slug) {
        Some("GET, PUT, PATCH")
    } else if OBSOLETE_INFRASTRUCTURE_MIGRATION_GET_PUT.contains(&slug) {
        Some("GET, PUT")
    } else if OBSOLETE_INFRASTRUCTURE_MIGRATION_PUT_ONLY.contains(&slug) {
        Some("PUT")
    } else {
        None
    }
}
