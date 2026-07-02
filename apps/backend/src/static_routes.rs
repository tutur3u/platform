//! static_routes helpers extracted from `lib.rs` (pure movement).

use crate::*;
use serde_json::{Value, json};

#[derive(Serialize)]
pub(crate) struct CalendarMockEvent {
    end_at: &'static str,
    id: u8,
    start_at: &'static str,
    title: &'static str,
}

#[derive(Serialize)]
pub(crate) struct UserFieldType {
    id: &'static str,
}

pub(crate) fn calendar_mock_response() -> BackendResponse {
    json_response(
        200,
        json!({
            "data": [
                CalendarMockEvent {
                    id: 1,
                    title: "Event 1",
                    start_at: "2023-10-01T10:00:00Z",
                    end_at: "2023-10-01T11:00:00Z",
                },
                CalendarMockEvent {
                    id: 2,
                    title: "Event 2",
                    start_at: "2023-10-02T12:00:00Z",
                    end_at: "2023-10-02T13:00:00Z",
                },
                CalendarMockEvent {
                    id: 3,
                    title: "Event 3",
                    start_at: "2023-10-03T14:00:00Z",
                    end_at: "2023-10-03T15:00:00Z",
                },
            ],
        }),
    )
}

pub(crate) fn user_field_types_response() -> BackendResponse {
    json_response(
        200,
        [
            UserFieldType { id: "TEXT" },
            UserFieldType { id: "NUMBER" },
            UserFieldType { id: "BOOLEAN" },
            UserFieldType { id: "DATE" },
            UserFieldType { id: "DATETIME" },
        ],
    )
}

pub(crate) fn mobile_auth_cors_preflight_response() -> BackendResponse {
    let mut response = empty_response(204);
    response
        .headers
        .push(("access-control-allow-origin", "*".to_owned()));
    response.headers.push((
        "access-control-allow-methods",
        MOBILE_AUTH_CORS_ALLOW_METHODS.to_owned(),
    ));
    response.headers.push((
        "access-control-allow-headers",
        MOBILE_AUTH_CORS_ALLOW_HEADERS.to_owned(),
    ));
    response.headers.push((
        "access-control-max-age",
        MOBILE_AUTH_CORS_MAX_AGE.to_owned(),
    ));
    response
}

pub(crate) fn webgl_package_upload_options_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    let mut response = empty_response(204);

    let Some(origin) = allowed_webgl_package_upload_origin(config, request.origin) else {
        return response;
    };

    response
        .headers
        .push(("access-control-allow-origin", origin));
    response
        .headers
        .push(("access-control-allow-credentials", "true".to_owned()));
    response.headers.push((
        "access-control-allow-methods",
        WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_METHODS.to_owned(),
    ));
    response.headers.push((
        "access-control-allow-headers",
        WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_HEADERS.to_owned(),
    ));
    response.headers.push(("vary", "Origin".to_owned()));
    response
}

pub(crate) fn allowed_webgl_package_upload_origin(
    config: &BackendConfig,
    origin: Option<&str>,
) -> Option<String> {
    let origin = origin.and_then(url_origin)?;

    if WEBGL_PACKAGE_UPLOAD_CORS_STATIC_ORIGINS.contains(&origin.as_str())
        || config_origin_matches(&config.cms_app_url, &origin)
        || config_origin_matches(&config.next_public_cms_app_url, &origin)
    {
        return Some(origin);
    }

    None
}

pub(crate) fn config_origin_matches(configured_url: &str, request_origin: &str) -> bool {
    url_origin(configured_url).as_deref() == Some(request_origin)
}

pub(crate) fn disabled_group_check_email_response() -> BackendResponse {
    json_response(
        410,
        json!({
            "message": DISABLED_GROUP_CHECK_EMAIL_MESSAGE,
        }),
    )
}

pub(crate) fn serwist_route_response(path: &str) -> BackendResponse {
    match path {
        SERWIST_SERVICE_WORKER_PATH => {
            let mut response = no_store_response(text_response(
                200,
                SERWIST_DECOMMISSION_WORKER,
                "application/javascript",
            ));
            response
                .headers
                .push(("service-worker-allowed", "/".to_owned()));
            response
        }
        SERWIST_SOURCE_MAP_PATH => no_store_response(text_response(
            200,
            SERWIST_DECOMMISSION_SOURCE_MAP,
            "application/json; charset=UTF-8",
        )),
        _ => empty_response(404),
    }
}

pub(crate) fn browser_state_recovery_page_response() -> BackendResponse {
    no_store_response(text_response(
        200,
        BROWSER_STATE_RECOVERY_HTML,
        "text/html; charset=utf-8",
    ))
}

pub(crate) fn browser_state_recovery_post_response(request: BackendRequest<'_>) -> BackendResponse {
    if !is_same_origin_recovery_request(request) {
        return no_store_response(json_response(
            403,
            json!({
                "error": "Browser state reset requires same-origin confirmation",
            }),
        ));
    }

    let Some(location) = resolve_login_recovery_url(request.url) else {
        return no_store_response(json_response(
            403,
            json!({
                "error": "Browser state reset requires same-origin confirmation",
            }),
        ));
    };

    let mut response = no_store_response(empty_response(307));
    response
        .headers
        .push(("location", location.as_str().to_owned()));
    response.headers.push((
        "clear-site-data",
        BROWSER_STATE_RECOVERY_CLEAR_SITE_DATA.to_owned(),
    ));

    for cookie_name in auth_cookie_names(request.cookie) {
        response.headers.push((
            "set-cookie",
            format!("{cookie_name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"),
        ));
    }

    response
}

pub(crate) fn language_cookie_post_response(request: BackendRequest<'_>) -> BackendResponse {
    let body = parse_json_body(request.body_text);
    let locale = body.as_ref().and_then(|body| body.get("locale"));

    if !json_value_is_present(locale) {
        return json_response(500, json!({ "message": "Locale is required" }));
    }

    let Some(locale) = locale.and_then(Value::as_str) else {
        return json_response(500, json!({ "message": "Locale is not supported" }));
    };

    if !SUPPORTED_LOCALES.contains(&locale) {
        return json_response(500, json!({ "message": "Locale is not supported" }));
    }

    set_cookie_success_response(LOCALE_COOKIE_NAME, locale)
}

pub(crate) fn sidebar_cookie_post_response(request: BackendRequest<'_>) -> BackendResponse {
    let body = parse_json_body(request.body_text);
    let collapsed = body.as_ref().and_then(|body| body.get("collapsed"));

    if !json_value_is_present(collapsed) {
        return json_response(500, json!({ "message": "Collapse is required" }));
    }

    set_cookie_success_response(
        SIDEBAR_COLLAPSED_COOKIE_NAME,
        &cookie_value_from_json(collapsed.unwrap()),
    )
}

pub(crate) fn sidebar_sizes_cookie_post_response(request: BackendRequest<'_>) -> BackendResponse {
    let body = parse_json_body(request.body_text);
    let sidebar = body.as_ref().and_then(|body| body.get("sidebar"));
    let main = body.as_ref().and_then(|body| body.get("main"));

    if !json_value_is_present(sidebar) || !json_value_is_present(main) {
        return json_response(500, json!({ "message": "Sizes is required" }));
    }

    let mut response = success_response();
    response.headers.push((
        "set-cookie",
        format_cookie(
            SIDEBAR_SIZE_COOKIE_NAME,
            &cookie_value_from_json(sidebar.unwrap()),
        ),
    ));
    response.headers.push((
        "set-cookie",
        format_cookie(
            MAIN_CONTENT_SIZE_COOKIE_NAME,
            &cookie_value_from_json(main.unwrap()),
        ),
    ));
    response
}

pub(crate) fn json_value_is_present(value: Option<&Value>) -> bool {
    value.is_some_and(|value| !value.is_null())
}

pub(crate) fn cookie_value_from_json(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        _ => value.to_string(),
    }
}

pub(crate) fn is_same_origin_recovery_request(request: BackendRequest<'_>) -> bool {
    let Some(request_origin) = request.url.and_then(url_origin) else {
        return false;
    };

    if let Some(origin) = request.origin {
        return url_origin(origin).as_deref() == Some(request_origin.as_str());
    }

    request
        .referer
        .and_then(url_origin)
        .as_deref()
        .is_some_and(|referer_origin| referer_origin == request_origin)
}

pub(crate) fn resolve_login_recovery_url(request_url: Option<&str>) -> Option<String> {
    let mut url = url::Url::parse(request_url?).ok()?;
    url.set_path("/login");
    url.set_query(Some("browserStateReset=1"));
    url.set_fragment(None);

    Some(url.to_string())
}

pub(crate) fn auth_cookie_names(cookie_header: Option<&str>) -> Vec<&str> {
    cookie_header
        .into_iter()
        .flat_map(|header| header.split(';'))
        .filter_map(|cookie| cookie.trim().split_once('='))
        .map(|(name, _value)| name.trim())
        .filter(|name| is_supabase_auth_cookie_name(name))
        .collect()
}

pub(crate) fn is_supabase_auth_cookie_name(name: &str) -> bool {
    let base_name = name
        .rsplit_once('.')
        .and_then(|(base_name, suffix)| {
            suffix
                .chars()
                .all(|character| character.is_ascii_digit())
                .then_some(base_name)
        })
        .unwrap_or(name);

    let Some(project_ref) = base_name
        .strip_prefix("sb-")
        .and_then(|value| value.strip_suffix("-auth-token"))
    else {
        return false;
    };

    !project_ref.is_empty()
        && project_ref
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

pub(crate) fn url_origin(value: &str) -> Option<String> {
    url::Url::parse(value)
        .ok()
        .map(|url| url.origin().ascii_serialization())
}
