use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MIGRATION_MANIFEST_PATH: &str = "apps/tanstack-web/migration/route-manifest.json";
const MIGRATION_MANIFEST_JSON: &str =
    include_str!("../../tanstack-web/migration/route-manifest.json");
const APPLICATION_JSON: &str = "application/json";
const JSON_SECURITY_HEADERS: [(&str, &str); 4] = [
    (
        "content-security-policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    ),
    ("referrer-policy", "no-referrer"),
    ("x-content-type-options", "nosniff"),
    ("x-frame-options", "DENY"),
];
const TOP_LEGACY_ROUTE_LIMIT: usize = 20;
const WELL_KNOWN_CACHE_CONTROL: &str = "public, max-age=300, must-revalidate";
const SERWIST_SERVICE_WORKER_PATH: &str = "/serwist/sw.js";
const SERWIST_SOURCE_MAP_PATH: &str = "/serwist/sw.js.map";
const SERWIST_DECOMMISSION_WORKER: &str = r#"self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await self.registration.unregister();
    })()
  );
});
"#;
const SERWIST_DECOMMISSION_SOURCE_MAP: &str = r#"{"version":3,"file":"sw.js","sources":["serwist-decommission-worker.js"],"names":[],"mappings":""}"#;
const BROWSER_STATE_RECOVERY_PATH: &str = "/~recover-browser-state";
const BROWSER_STATE_RECOVERY_HTML: &str = r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Reset Browser State</title>
  </head>
  <body>
    <main>
      <h1>Reset browser state</h1>
      <p>This clears cached Tuturuuu browser data and returns you to login.</p>
      <form method="post" action="/~recover-browser-state">
        <button type="submit">Reset browser state</button>
      </form>
    </main>
  </body>
</html>"#;
const BROWSER_STATE_RECOVERY_CLEAR_SITE_DATA: &str =
    r#""cache", "cookies", "storage", "executionContexts""#;
const NO_STORE_CACHE_CONTROL: &str = "no-store, no-cache, must-revalidate";
const NO_STORE_CDN_CACHE_CONTROL: &str = "no-store";
const LOCALE_COOKIE_NAME: &str = "NEXT_LOCALE";
const SIDEBAR_COLLAPSED_COOKIE_NAME: &str = "sidebar-collapsed";
const SIDEBAR_SIZE_COOKIE_NAME: &str = "sidebar-size";
const MAIN_CONTENT_SIZE_COOKIE_NAME: &str = "main-content-size";
const SUPPORTED_LOCALES: [&str; 2] = ["en", "vi"];
const COOKIE_DELETE_VALUE: &str = "; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
const GROUPED_SCORE_NAMES_MIGRATION_PATH: &str =
    "/api/v1/infrastructure/migrate/grouped-score-names";
const GROUPED_SCORE_NAMES_MIGRATION_DISABLED_MESSAGE: &str = "Grouped score names migration is no longer available. The user_group_indicators table was removed in a recent database migration.";
const USER_FIELD_TYPES_PATH: &str = "/api/v1/infrastructure/users/fields/types";
const AUTH_CORS_PREFLIGHT_PATHS: [&str; 8] = [
    "/api/v1/auth/password-login",
    "/api/v1/auth/mobile/password-login",
    "/api/v1/auth/mobile/send-otp",
    "/api/v1/auth/mobile/verify-otp",
    "/api/v1/auth/otp/send",
    "/api/v1/auth/otp/verify",
    "/api/v1/auth/otp/settings",
    "/api/v1/mobile/version-check",
];
const MOBILE_AUTH_CORS_ALLOW_METHODS: &str = "GET, POST, OPTIONS";
const MOBILE_AUTH_CORS_ALLOW_HEADERS: &str = "Content-Type, Authorization";
const MOBILE_AUTH_CORS_MAX_AGE: &str = "86400";
const WEBGL_PACKAGE_UPLOAD_CORS_STATIC_ORIGINS: [&str; 2] =
    ["https://cms.tuturuuu.com", "http://localhost:7811"];
const WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_METHODS: &str = "PUT, OPTIONS";
const WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_HEADERS: &str = "Authorization, Content-Type";
const BARE_AUTH_PREFLIGHT_PATHS: [&str; 3] = [
    "/api/v1/auth/qr-login/challenges",
    "/api/v1/auth/mfa/mobile/challenges",
    "/api/v1/auth/mfa/mobile/approvals",
];
const DISABLED_GROUP_CHECK_EMAIL_MESSAGE: &str = "Direct post email sending has been removed. Emails are now sent by the system queue after approval.";
#[cfg(feature = "native")]
const TRUTHY_ENV_VALUES: [&str; 4] = ["1", "true", "yes", "on"];
#[cfg(feature = "native")]
const SAFE_LOCAL_WEB_ORIGINS: [&str; 8] = [
    "http://127.0.0.1:7803",
    "http://127.0.0.1:7824",
    "http://localhost:7803",
    "http://localhost:7824",
    "https://tanstack.tuturuuu.localhost",
    "https://tanstack.tuturuuu.localhost:1355",
    "https://tuturuuu.localhost",
    "https://tuturuuu.localhost:1355",
];
#[cfg(feature = "native")]
const SAFE_LOCAL_SUPABASE_ORIGINS: [&str; 3] = [
    "http://127.0.0.1:8001",
    "http://host.docker.internal:8001",
    "http://localhost:8001",
];
#[cfg(feature = "native")]
const LOCAL_E2E_WEB_URL_KEYS: [&str; 5] = [
    "BASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_WEB_APP_URL",
    "PORTLESS_URL",
    "WEB_APP_URL",
];
#[cfg(feature = "native")]
const LOCAL_E2E_SUPABASE_URL_KEYS: [&str; 4] = [
    "DOCKER_INTERNAL_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVER_URL",
    "SUPABASE_URL",
];
#[cfg(feature = "native")]
const SUPABASE_REFERENCE_KEYS: [&str; 7] = [
    "DATABASE_URL",
    "DIRECT_URL",
    "DOCKER_INTERNAL_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "POSTGRES_URL",
    "SUPABASE_SERVER_URL",
    "SUPABASE_URL",
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendConfig {
    pub deployment_target: String,
    pub environment: String,
    pub internal_token: String,
    pub local_e2e_migration_access: bool,
    pub port: u16,
    pub service_name: String,
    pub cms_app_url: String,
    pub next_public_cms_app_url: String,
}

impl BackendConfig {
    pub fn new(environment: impl Into<String>, service_name: impl Into<String>) -> Self {
        Self {
            deployment_target: default_deployment_target().to_owned(),
            environment: environment.into(),
            internal_token: String::new(),
            local_e2e_migration_access: false,
            port: 7820,
            service_name: service_name.into(),
            cms_app_url: String::new(),
            next_public_cms_app_url: String::new(),
        }
    }

    #[cfg(feature = "native")]
    pub fn from_env() -> Self {
        Self {
            deployment_target: env("BACKEND_DEPLOYMENT_TARGET", default_deployment_target()),
            environment: env("BACKEND_ENV", "development"),
            internal_token: std::env::var("BACKEND_INTERNAL_TOKEN")
                .unwrap_or_default()
                .trim()
                .to_owned(),
            local_e2e_migration_access: allows_local_e2e_migration_access(),
            port: parse_port(&env("PORT", "7820")),
            service_name: env("BACKEND_SERVICE_NAME", "backend"),
            cms_app_url: env("CMS_APP_URL", ""),
            next_public_cms_app_url: env("NEXT_PUBLIC_CMS_APP_URL", ""),
        }
    }

    pub fn ready(&self) -> bool {
        !self.internal_token.is_empty()
    }

    pub fn toolchain(&self) -> String {
        option_env!("RUSTC_VERSION")
            .unwrap_or("rustc unavailable")
            .to_owned()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BackendRequest<'a> {
    pub authorization: Option<&'a str>,
    pub body_text: Option<&'a str>,
    pub cookie: Option<&'a str>,
    pub method: &'a str,
    pub origin: Option<&'a str>,
    pub path: &'a str,
    pub referer: Option<&'a str>,
    pub request_id: Option<&'a str>,
    pub url: Option<&'a str>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BackendResponse {
    pub allow: Option<&'static str>,
    pub body: Value,
    pub body_empty: bool,
    pub body_text: Option<String>,
    pub cache_control: Option<&'static str>,
    pub content_type: Option<&'static str>,
    pub headers: Vec<(&'static str, String)>,
    pub status: u16,
}

pub fn json_security_headers() -> &'static [(&'static str, &'static str)] {
    &JSON_SECURITY_HEADERS
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendRuntime {
    deployment_target: String,
    runtime: &'static str,
    service: String,
    toolchain: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    environment: String,
    ok: bool,
    runtime: &'static str,
    service: String,
}

#[derive(Serialize)]
struct CalendarMockEvent {
    end_at: &'static str,
    id: u8,
    start_at: &'static str,
    title: &'static str,
}

#[derive(Serialize)]
struct UserFieldType {
    id: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationStatus {
    backend: BackendRuntime,
    environment: String,
    frontend_targets: [&'static str; 2],
    ok: bool,
    route_ownership: RouteOwnership,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteOwnership {
    legacy_allowed: bool,
    manifest: &'static str,
    status: &'static str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RouteManifest {
    generated_by: String,
    routes: Vec<RouteManifestRoute>,
    summary: RouteManifestSummary,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteManifestSummary {
    api_routes: usize,
    cron_routes: usize,
    layouts: usize,
    method_counts: BTreeMap<String, usize>,
    pages: usize,
    route_handlers: usize,
    total: usize,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RouteManifestRoute {
    id: String,
    kind: String,
    method: Option<String>,
    methods: Vec<String>,
    parent_id: Option<String>,
    route_path: String,
    source_file: String,
    status: String,
    target_owner: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationProgress {
    generated_by: String,
    manifest: &'static str,
    ok: bool,
    progress: RouteManifestProgress,
    summary: RouteManifestSummary,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteManifestProgress {
    by_kind: Vec<RouteManifestProgressBucket>,
    by_owner: Vec<RouteManifestProgressBucket>,
    top_legacy_routes: Vec<RouteManifestProgressRoute>,
    totals: RouteManifestProgressBucket,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteManifestProgressBucket {
    accepted_removal: usize,
    key: String,
    label: String,
    legacy_next: usize,
    migrated: usize,
    percent_complete: f64,
    remaining: usize,
    terminal: usize,
    total: usize,
    unknown_status: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RouteManifestProgressRoute {
    id: Option<String>,
    kind: String,
    method: Option<String>,
    methods: Vec<String>,
    parent_id: Option<String>,
    route_path: String,
    source_file: String,
    status: String,
    target_owner: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationCutoverGates {
    counts: MigrationRouteCounts,
    gates: Vec<MigrationGate>,
    generated_by: String,
    manifest: &'static str,
    ok: bool,
    summary: RouteManifestSummary,
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationRouteCounts {
    accepted_removal: usize,
    backend_owned: usize,
    backend_route_artifacts: usize,
    frontend_owned: usize,
    legacy_next: usize,
    migrated: usize,
    total: usize,
    unknown_status: usize,
    unmapped: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationGate {
    detail: String,
    id: &'static str,
    label: &'static str,
    ok: bool,
    status: &'static str,
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
        ("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH) => {
            grouped_score_names_migration_response(config)
        }
        (method, GROUPED_SCORE_NAMES_MIGRATION_PATH) => method_not_allowed(method, "PUT"),
        ("GET", USER_FIELD_TYPES_PATH) => user_field_types_response(),
        (method, USER_FIELD_TYPES_PATH) => method_not_allowed(method, "GET"),
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

fn migration_status_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    json_response(
        200,
        MigrationStatus {
            backend: BackendRuntime {
                deployment_target: config.deployment_target.clone(),
                runtime: "rust",
                service: config.service_name.clone(),
                toolchain: config.toolchain(),
            },
            environment: config.environment.clone(),
            frontend_targets: ["next", "tanstack-start"],
            ok: true,
            route_ownership: RouteOwnership {
                legacy_allowed: true,
                manifest: MIGRATION_MANIFEST_PATH,
                status: "migration-foundation",
            },
        },
    )
}

fn migration_manifest_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    match serde_json::from_str::<Value>(MIGRATION_MANIFEST_JSON) {
        Ok(manifest) => json_response(200, manifest),
        Err(error) => json_response(
            500,
            json!({
                "error": "route manifest parse failed",
                "message": error.to_string(),
            }),
        ),
    }
}

fn calendar_mock_response() -> BackendResponse {
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

fn user_field_types_response() -> BackendResponse {
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

fn mobile_auth_cors_preflight_response() -> BackendResponse {
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

fn webgl_package_upload_options_response(
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

fn allowed_webgl_package_upload_origin(
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

fn config_origin_matches(configured_url: &str, request_origin: &str) -> bool {
    url_origin(configured_url).as_deref() == Some(request_origin)
}

fn disabled_group_check_email_response() -> BackendResponse {
    json_response(
        410,
        json!({
            "message": DISABLED_GROUP_CHECK_EMAIL_MESSAGE,
        }),
    )
}

fn serwist_route_response(path: &str) -> BackendResponse {
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

fn browser_state_recovery_page_response() -> BackendResponse {
    no_store_response(text_response(
        200,
        BROWSER_STATE_RECOVERY_HTML,
        "text/html; charset=utf-8",
    ))
}

fn browser_state_recovery_post_response(request: BackendRequest<'_>) -> BackendResponse {
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

fn language_cookie_post_response(request: BackendRequest<'_>) -> BackendResponse {
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

fn sidebar_cookie_post_response(request: BackendRequest<'_>) -> BackendResponse {
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

fn sidebar_sizes_cookie_post_response(request: BackendRequest<'_>) -> BackendResponse {
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

fn parse_json_body(body_text: Option<&str>) -> Option<Value> {
    serde_json::from_str(body_text.unwrap_or_default()).ok()
}

fn json_value_is_present(value: Option<&Value>) -> bool {
    value.is_some_and(|value| !value.is_null())
}

fn cookie_value_from_json(value: &Value) -> String {
    match value {
        Value::String(value) => value.clone(),
        _ => value.to_string(),
    }
}

fn success_response() -> BackendResponse {
    json_response(200, json!({ "message": "Success" }))
}

fn not_implemented_response() -> BackendResponse {
    json_response(501, json!({ "message": "Not implemented" }))
}

fn set_cookie_success_response(cookie_name: &str, cookie_value: &str) -> BackendResponse {
    let mut response = success_response();
    response
        .headers
        .push(("set-cookie", format_cookie(cookie_name, cookie_value)));
    response
}

fn delete_cookie_success_response(cookie_name: &'static str) -> BackendResponse {
    let mut response = success_response();
    response
        .headers
        .push(("set-cookie", format!("{cookie_name}={COOKIE_DELETE_VALUE}")));
    response
}

fn format_cookie(cookie_name: &str, cookie_value: &str) -> String {
    format!("{cookie_name}={cookie_value}; Path=/")
}

fn is_same_origin_recovery_request(request: BackendRequest<'_>) -> bool {
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

fn resolve_login_recovery_url(request_url: Option<&str>) -> Option<String> {
    let mut url = url::Url::parse(request_url?).ok()?;
    url.set_path("/login");
    url.set_query(Some("browserStateReset=1"));
    url.set_fragment(None);

    Some(url.to_string())
}

fn auth_cookie_names(cookie_header: Option<&str>) -> Vec<&str> {
    cookie_header
        .into_iter()
        .flat_map(|header| header.split(';'))
        .filter_map(|cookie| cookie.trim().split_once('='))
        .map(|(name, _value)| name.trim())
        .filter(|name| is_supabase_auth_cookie_name(name))
        .collect()
}

fn is_supabase_auth_cookie_name(name: &str) -> bool {
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

fn url_origin(value: &str) -> Option<String> {
    url::Url::parse(value)
        .ok()
        .map(|url| url.origin().ascii_serialization())
}

fn grouped_score_names_migration_response(config: &BackendConfig) -> BackendResponse {
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

fn require_infrastructure_migration_dev_mode(config: &BackendConfig) -> Option<BackendResponse> {
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

fn migration_cutover_gates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    match parse_route_manifest() {
        Ok(manifest) => json_response(200, migration_cutover_gates(manifest)),
        Err(error) => json_response(
            500,
            json!({
                "error": "route manifest parse failed",
                "message": error.to_string(),
            }),
        ),
    }
}

fn migration_progress_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
) -> BackendResponse {
    if let Some(response) = require_internal_authorization(config, request.authorization) {
        return response;
    }

    match parse_route_manifest() {
        Ok(manifest) => {
            let progress = route_manifest_progress(&manifest.routes);

            json_response(
                200,
                MigrationProgress {
                    generated_by: manifest.generated_by,
                    manifest: MIGRATION_MANIFEST_PATH,
                    ok: progress.totals.remaining == 0,
                    progress,
                    summary: manifest.summary,
                },
            )
        }
        Err(error) => json_response(
            500,
            json!({
                "error": "route manifest parse failed",
                "message": error.to_string(),
            }),
        ),
    }
}

fn parse_route_manifest() -> Result<RouteManifest, serde_json::Error> {
    serde_json::from_str(MIGRATION_MANIFEST_JSON)
}

fn migration_cutover_gates(manifest: RouteManifest) -> MigrationCutoverGates {
    let counts = migration_route_counts(&manifest.routes);
    let manifest_current = counts.total == manifest.summary.total;
    let no_legacy_routes = counts.legacy_next == 0;
    let no_unmapped_routes = counts.unmapped == 0;
    let no_unknown_status = counts.unknown_status == 0;
    let backend_routes_mapped = counts.backend_route_artifacts == counts.backend_owned;
    let terminal_statuses = counts.total == counts.migrated + counts.accepted_removal;
    let external_e2e_evidence = false;
    let external_benchmark_evidence = false;
    let ok = manifest_current
        && no_legacy_routes
        && no_unmapped_routes
        && no_unknown_status
        && backend_routes_mapped
        && terminal_statuses
        && external_e2e_evidence
        && external_benchmark_evidence;

    MigrationCutoverGates {
        counts,
        gates: vec![
            gate(
                "route-manifest-current",
                "Route manifest parity",
                manifest_current,
                format!(
                    "Manifest summary tracks {} route artifacts.",
                    manifest.summary.total
                ),
            ),
            gate(
                "no-legacy-routes",
                "No legacy route ownership",
                no_legacy_routes,
                format!(
                    "{} route artifacts still have legacy-next status.",
                    counts.legacy_next
                ),
            ),
            gate(
                "no-unmapped-routes",
                "No unmapped route artifacts",
                no_unmapped_routes && no_unknown_status,
                format!(
                    "{} routes are unmapped and {} routes have unknown status.",
                    counts.unmapped, counts.unknown_status
                ),
            ),
            gate(
                "backend-owned-routes-mapped",
                "Backend-owned handlers mapped",
                backend_routes_mapped,
                format!(
                    "{} of {} backend route artifacts target the Rust backend.",
                    counts.backend_owned, counts.backend_route_artifacts
                ),
            ),
            gate(
                "terminal-migration-statuses",
                "Terminal migration statuses",
                terminal_statuses,
                format!(
                    "{} migrated and {} accepted-removal artifacts recorded.",
                    counts.migrated, counts.accepted_removal
                ),
            ),
            gate(
                "docker-e2e-compare",
                "Docker E2E compare",
                external_e2e_evidence,
                "Compare-mode Docker E2E evidence is not attached to this gate.".to_owned(),
            ),
            gate(
                "benchmark-compare",
                "Benchmark compare",
                external_benchmark_evidence,
                "Full compare benchmark evidence is not attached to this gate.".to_owned(),
            ),
        ],
        generated_by: manifest.generated_by,
        manifest: MIGRATION_MANIFEST_PATH,
        ok,
        summary: manifest.summary,
    }
}

fn migration_route_counts(routes: &[RouteManifestRoute]) -> MigrationRouteCounts {
    let mut counts = MigrationRouteCounts {
        total: routes.len(),
        ..MigrationRouteCounts::default()
    };

    for route in routes {
        match route.status.as_str() {
            "accepted-removal" => counts.accepted_removal += 1,
            "legacy-next" => counts.legacy_next += 1,
            "migrated" => counts.migrated += 1,
            _ => counts.unknown_status += 1,
        }

        match route.target_owner.as_str() {
            "rust-backend" => counts.backend_owned += 1,
            "tanstack-start" => counts.frontend_owned += 1,
            _ => counts.unmapped += 1,
        }

        if is_backend_route_kind(&route.kind) {
            counts.backend_route_artifacts += 1;
        }
    }

    counts
}

fn is_backend_route_kind(kind: &str) -> bool {
    matches!(kind, "api" | "cron" | "route-handler" | "trpc")
}

fn route_manifest_progress(routes: &[RouteManifestRoute]) -> RouteManifestProgress {
    let mut totals = progress_bucket("total", "All route artifacts");
    let mut by_owner = BTreeMap::new();
    let mut by_kind = BTreeMap::new();
    let mut top_legacy_routes = Vec::new();

    for route in routes {
        update_progress_bucket(&mut totals, route);
        update_progress_bucket(
            by_owner
                .entry(route.target_owner.clone())
                .or_insert_with(|| {
                    progress_bucket(&route.target_owner, owner_label(&route.target_owner))
                }),
            route,
        );
        update_progress_bucket(
            by_kind
                .entry(route.kind.clone())
                .or_insert_with(|| progress_bucket(&route.kind, &route.kind)),
            route,
        );

        if !is_terminal_migration_status(&route.status)
            && top_legacy_routes.len() < TOP_LEGACY_ROUTE_LIMIT
        {
            top_legacy_routes.push(RouteManifestProgressRoute {
                id: Some(route.id.clone()),
                kind: route.kind.clone(),
                method: route.method.clone(),
                methods: route.methods.clone(),
                parent_id: route.parent_id.clone(),
                route_path: route.route_path.clone(),
                source_file: route.source_file.clone(),
                status: route.status.clone(),
                target_owner: route.target_owner.clone(),
            });
        }
    }

    RouteManifestProgress {
        by_kind: finalize_progress_buckets(by_kind.into_values().collect()),
        by_owner: finalize_progress_buckets(by_owner.into_values().collect()),
        top_legacy_routes,
        totals: finalize_progress_bucket(totals),
    }
}

fn progress_bucket(key: &str, label: &str) -> RouteManifestProgressBucket {
    RouteManifestProgressBucket {
        key: key.to_owned(),
        label: label.to_owned(),
        ..RouteManifestProgressBucket::default()
    }
}

fn update_progress_bucket(bucket: &mut RouteManifestProgressBucket, route: &RouteManifestRoute) {
    bucket.total += 1;

    match route.status.as_str() {
        "accepted-removal" => bucket.accepted_removal += 1,
        "legacy-next" => bucket.legacy_next += 1,
        "migrated" => bucket.migrated += 1,
        _ => bucket.unknown_status += 1,
    }
}

fn finalize_progress_buckets(
    buckets: Vec<RouteManifestProgressBucket>,
) -> Vec<RouteManifestProgressBucket> {
    let mut buckets: Vec<_> = buckets.into_iter().map(finalize_progress_bucket).collect();
    buckets.sort_by(|left, right| {
        right
            .remaining
            .cmp(&left.remaining)
            .then_with(|| right.total.cmp(&left.total))
            .then_with(|| left.key.cmp(&right.key))
    });
    buckets
}

fn finalize_progress_bucket(
    mut bucket: RouteManifestProgressBucket,
) -> RouteManifestProgressBucket {
    bucket.terminal = bucket.accepted_removal + bucket.migrated;
    bucket.remaining = bucket.legacy_next + bucket.unknown_status;
    bucket.percent_complete = if bucket.total == 0 {
        100.0
    } else {
        ((bucket.terminal as f64 / bucket.total as f64) * 10_000.0).round() / 100.0
    };
    bucket
}

fn owner_label(owner: &str) -> &str {
    match owner {
        "rust-backend" => "Rust backend",
        "tanstack-start" => "TanStack Start",
        _ => owner,
    }
}

fn is_terminal_migration_status(status: &str) -> bool {
    matches!(status, "accepted-removal" | "migrated")
}

fn gate(id: &'static str, label: &'static str, ok: bool, detail: String) -> MigrationGate {
    MigrationGate {
        detail,
        id,
        label,
        ok,
        status: if ok { "pass" } else { "blocked" },
    }
}

fn require_internal_authorization(
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

fn handle_job(config: &BackendConfig, request: BackendRequest<'_>, path: &str) -> BackendResponse {
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

fn json_response(status: u16, payload: impl Serialize) -> BackendResponse {
    json_response_inner(status, payload, None)
}

fn json_response_with_cache_control(
    status: u16,
    payload: impl Serialize,
    cache_control: &'static str,
) -> BackendResponse {
    json_response_inner(status, payload, Some(cache_control))
}

fn json_response_inner(
    status: u16,
    payload: impl Serialize,
    cache_control: Option<&'static str>,
) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: serde_json::to_value(payload).unwrap_or_else(|_| json!({ "error": "serialize" })),
        body_empty: false,
        body_text: None,
        cache_control,
        content_type: Some(APPLICATION_JSON),
        headers: Vec::new(),
        status,
    }
}

fn text_response(
    status: u16,
    body: impl Into<String>,
    content_type: &'static str,
) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: false,
        body_text: Some(body.into()),
        cache_control: None,
        content_type: Some(content_type),
        headers: Vec::new(),
        status,
    }
}

fn empty_response(status: u16) -> BackendResponse {
    BackendResponse {
        allow: None,
        body: Value::Null,
        body_empty: true,
        body_text: None,
        cache_control: None,
        content_type: None,
        headers: Vec::new(),
        status,
    }
}

fn empty_response_with_cache_control(status: u16, cache_control: &'static str) -> BackendResponse {
    let mut response = empty_response(status);
    response.cache_control = Some(cache_control);
    response
}

fn no_store_response(mut response: BackendResponse) -> BackendResponse {
    response.cache_control = Some(NO_STORE_CACHE_CONTROL);
    response
        .headers
        .push(("cdn-cache-control", NO_STORE_CDN_CACHE_CONTROL.to_owned()));
    response
}

fn method_not_allowed(_method: &str, allow: &'static str) -> BackendResponse {
    BackendResponse {
        allow: Some(allow),
        body: json!({ "error": "method not allowed" }),
        body_empty: false,
        body_text: None,
        cache_control: None,
        content_type: Some(APPLICATION_JSON),
        headers: Vec::new(),
        status: 405,
    }
}

fn is_well_known_path(path: &str) -> bool {
    path.starts_with("/.well-known/")
}

fn is_serwist_route_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 2 && segments[0] == "serwist" && !segments[1].is_empty()
}

fn is_auth_cors_preflight_path(path: &str) -> bool {
    AUTH_CORS_PREFLIGHT_PATHS.contains(&path)
}

fn is_bare_auth_preflight_path(path: &str) -> bool {
    BARE_AUTH_PREFLIGHT_PATHS.contains(&path)
        || is_qr_login_challenge_path(path)
        || is_mfa_mobile_challenge_path(path)
}

fn is_qr_login_challenge_path(path: &str) -> bool {
    let segments = path_segments(path);

    (segments.len() == 6 || (segments.len() == 7 && segments[6] == "approve"))
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "auth"
        && segments[3] == "qr-login"
        && segments[4] == "challenges"
        && !segments[5].is_empty()
}

fn is_mfa_mobile_challenge_path(path: &str) -> bool {
    let segments = path_segments(path);

    (segments.len() == 7 || (segments.len() == 8 && segments[7] == "approve"))
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "auth"
        && segments[3] == "mfa"
        && segments[4] == "mobile"
        && segments[5] == "challenges"
        && !segments[6].is_empty()
}

fn is_workspace_slides_collection_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "slides"
        && !segments[3].is_empty()
}

fn is_workspace_slide_item_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "slides"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
}

fn is_webgl_package_upload_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "external-projects"
        && segments[5] == "webgl-packages"
        && segments[6] == "upload"
        && !segments[3].is_empty()
}

fn is_group_check_email_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "user-groups"
        && segments[6] == "group-checks"
        && segments[8] == "email"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
        && !segments[7].is_empty()
}

fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn authorized(config: &BackendConfig, authorization: Option<&str>) -> bool {
    let expected = format!("Bearer {}", config.internal_token);
    constant_time_eq(
        authorization.unwrap_or_default().as_bytes(),
        expected.as_bytes(),
    )
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut diff = left.len() ^ right.len();
    let max_len = left.len().max(right.len());

    for index in 0..max_len {
        let left_byte = left.get(index).copied().unwrap_or_default();
        let right_byte = right.get(index).copied().unwrap_or_default();
        diff |= usize::from(left_byte ^ right_byte);
    }

    diff == 0
}

fn generated_request_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    format!("rust-{nanos:x}")
}

#[cfg(feature = "native")]
fn env(name: &str, fallback: &str) -> String {
    std::env::var(name)
        .unwrap_or_else(|_| fallback.to_owned())
        .trim()
        .to_owned()
}

#[cfg(feature = "native")]
fn parse_port(value: &str) -> u16 {
    value
        .trim()
        .trim_start_matches(':')
        .parse::<u16>()
        .unwrap_or(7820)
}

#[cfg(feature = "native")]
fn allows_local_e2e_migration_access() -> bool {
    if !is_truthy_env_value(
        std::env::var("TUTURUUU_LOCAL_E2E_AUTH_BYPASS")
            .ok()
            .as_deref(),
    ) {
        return false;
    }

    if SUPABASE_REFERENCE_KEYS
        .iter()
        .any(|key| is_cloud_supabase_reference(std::env::var(key).ok().as_deref()))
    {
        return false;
    }

    has_only_allowed_origins(&LOCAL_E2E_WEB_URL_KEYS, &SAFE_LOCAL_WEB_ORIGINS)
        && has_only_allowed_origins(&LOCAL_E2E_SUPABASE_URL_KEYS, &SAFE_LOCAL_SUPABASE_ORIGINS)
}

#[cfg(feature = "native")]
fn is_truthy_env_value(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };

    TRUTHY_ENV_VALUES.contains(&value.trim().to_ascii_lowercase().as_str())
}

#[cfg(feature = "native")]
fn is_cloud_supabase_reference(value: Option<&str>) -> bool {
    let Some(value) = value else {
        return false;
    };
    let value = value.to_ascii_lowercase();

    value.contains("supabase.co") || value.contains("supabase.in")
}

#[cfg(feature = "native")]
fn has_only_allowed_origins(keys: &[&str], allowed_origins: &[&str]) -> bool {
    let mut has_configured_url = false;

    for key in keys {
        let Ok(value) = std::env::var(key) else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            continue;
        }

        has_configured_url = true;

        let Ok(url) = url::Url::parse(value) else {
            return false;
        };
        let origin = url.origin().ascii_serialization();

        if !allowed_origins.contains(&origin.as_str()) {
            return false;
        }
    }

    has_configured_url
}

fn default_deployment_target() -> &'static str {
    if cfg!(target_arch = "wasm32") {
        "cloudflare-workers"
    } else {
        "container"
    }
}

#[cfg(feature = "native")]
pub mod native {
    use super::{
        BackendConfig, BackendRequest, BackendResponse, json_security_headers, route_request,
    };
    use axum::Router;
    use axum::body::{Body, to_bytes};
    use axum::extract::State;
    use axum::http::header::{
        ALLOW, AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, COOKIE, HOST, ORIGIN, REFERER,
    };
    use axum::http::{HeaderValue, Request, Response, StatusCode};
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    pub fn router(config: BackendConfig) -> Router {
        Router::new().fallback(handle).with_state(config)
    }

    pub fn listen_addr(config: &BackendConfig) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), config.port)
    }

    pub fn healthcheck_addr(config: &BackendConfig) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), config.port)
    }

    const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024;

    async fn handle(State(config): State<BackendConfig>, request: Request<Body>) -> Response<Body> {
        let (parts, body) = request.into_parts();
        let method = parts.method.as_str().to_owned();
        let path = parts.uri.path().to_owned();
        let url = native_request_url(&parts.uri, &parts.headers);
        let authorization = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let request_id = parts
            .headers
            .get("X-Request-Id")
            .or_else(|| parts.headers.get("X-Request-ID"))
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let cookie = parts
            .headers
            .get(COOKIE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let origin = parts
            .headers
            .get(ORIGIN)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let referer = parts
            .headers
            .get(REFERER)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let body_text = to_bytes(body, MAX_REQUEST_BODY_BYTES)
            .await
            .ok()
            .and_then(|bytes| String::from_utf8(bytes.to_vec()).ok());

        route_request(
            &config,
            BackendRequest {
                authorization: authorization.as_deref(),
                body_text: body_text.as_deref(),
                cookie: cookie.as_deref(),
                method: &method,
                origin: origin.as_deref(),
                path: &path,
                referer: referer.as_deref(),
                request_id: request_id.as_deref(),
                url: Some(url.as_str()),
            },
        )
        .into_response()
    }

    fn native_request_url(uri: &axum::http::Uri, headers: &axum::http::HeaderMap) -> String {
        if uri.scheme().is_some() && uri.authority().is_some() {
            return uri.to_string();
        }

        let scheme = headers
            .get("x-forwarded-proto")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("http");
        let host = headers
            .get(HOST)
            .and_then(|value| value.to_str().ok())
            .filter(|value| !value.is_empty())
            .unwrap_or("localhost");

        format!("{scheme}://{host}{uri}")
    }

    impl BackendResponse {
        fn into_response(self) -> Response<Body> {
            let mut response = Response::builder().status(
                StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            );

            if let Some(content_type) = self.content_type {
                response = response.header(CONTENT_TYPE, HeaderValue::from_static(content_type));
            }

            if let Some(allow) = self.allow {
                response = response.header(ALLOW, HeaderValue::from_static(allow));
            }

            if let Some(cache_control) = self.cache_control {
                response = response.header(CACHE_CONTROL, HeaderValue::from_static(cache_control));
            }

            if self.content_type == Some(super::APPLICATION_JSON) {
                for &(name, value) in json_security_headers() {
                    response = response.header(name, HeaderValue::from_static(value));
                }
            }

            for (name, value) in self.headers {
                response = response.header(name, value);
            }

            let body = if let Some(body_text) = self.body_text {
                body_text
            } else if self.body_empty {
                String::new()
            } else {
                self.body.to_string()
            };

            response
                .body(Body::from(body))
                .unwrap_or_else(|_| Response::new(Body::from(r#"{"error":"response"}"#)))
        }
    }
}

#[cfg(all(feature = "worker", target_arch = "wasm32"))]
pub mod worker_runtime {
    use super::{
        BackendConfig, BackendRequest, BackendResponse, json_security_headers, route_request,
    };
    use worker::{Env, Request, Response, Result, event};

    #[event(fetch)]
    pub async fn main(mut request: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
        let config = worker_config(&env);
        let method = request.method().to_string();
        let path = request.path();
        let url = request.url()?.to_string();
        let headers = request.headers();
        let authorization = headers.get("Authorization")?;
        let cookie = headers.get("Cookie")?;
        let origin = headers.get("Origin")?;
        let referer = headers.get("Referer")?;
        let request_id = headers
            .get("X-Request-Id")?
            .or(headers.get("X-Request-ID")?);
        let body_text = request.text().await.ok();

        route_request(
            &config,
            BackendRequest {
                authorization: authorization.as_deref(),
                body_text: body_text.as_deref(),
                cookie: cookie.as_deref(),
                method: &method,
                origin: origin.as_deref(),
                path: &path,
                referer: referer.as_deref(),
                request_id: request_id.as_deref(),
                url: Some(url.as_str()),
            },
        )
        .into_worker_response()
    }

    fn worker_config(env: &Env) -> BackendConfig {
        BackendConfig {
            deployment_target: "cloudflare-workers".to_owned(),
            environment: var(env, "BACKEND_ENV", "production"),
            internal_token: var(env, "BACKEND_INTERNAL_TOKEN", ""),
            local_e2e_migration_access: false,
            port: 7820,
            service_name: var(env, "BACKEND_SERVICE_NAME", "backend"),
            cms_app_url: var(env, "CMS_APP_URL", ""),
            next_public_cms_app_url: var(env, "NEXT_PUBLIC_CMS_APP_URL", ""),
        }
    }

    fn var(env: &Env, name: &str, fallback: &str) -> String {
        env.var(name)
            .map(|value| value.to_string())
            .unwrap_or_else(|_| fallback.to_owned())
    }

    impl BackendResponse {
        fn into_worker_response(self) -> Result<Response> {
            let mut response = if let Some(body_text) = self.body_text {
                Response::ok(body_text)?.with_status(self.status)
            } else if self.body_empty {
                Response::empty()?.with_status(self.status)
            } else {
                Response::from_json(&self.body)?.with_status(self.status)
            };

            if let Some(content_type) = self.content_type {
                response.headers_mut().set("Content-Type", content_type)?;
            }

            if let Some(allow) = self.allow {
                response.headers_mut().set("Allow", allow)?;
            }

            if let Some(cache_control) = self.cache_control {
                response.headers_mut().set("Cache-Control", cache_control)?;
            }

            if self.content_type == Some(super::APPLICATION_JSON) {
                for &(name, value) in json_security_headers() {
                    response.headers_mut().set(name, value)?;
                }
            }

            for (name, value) in self.headers {
                response.headers_mut().append(name, value.as_str())?;
            }

            Ok(response)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: Some("https://tuturuuu.localhost/test"),
        }
    }

    fn request_with_body(
        method: &'static str,
        path: &'static str,
        body_text: &'static str,
    ) -> BackendRequest<'static> {
        BackendRequest {
            body_text: Some(body_text),
            ..request(method, path)
        }
    }

    fn authorized_request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some("Bearer secret"),
            ..request(method, path)
        }
    }

    fn backend_config_with_internal_token() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config.internal_token = "secret".to_owned();
        config
    }

    fn request_with_origin(
        method: &'static str,
        path: &'static str,
        origin: &'static str,
    ) -> BackendRequest<'static> {
        BackendRequest {
            origin: Some(origin),
            ..request(method, path)
        }
    }

    fn header_value<'a>(response: &'a BackendResponse, header: &str) -> Option<&'a str> {
        response
            .headers
            .iter()
            .find(|(name, _)| *name == header)
            .map(|(_, value)| value.as_str())
    }

    fn browser_recovery_request(
        origin: Option<&'static str>,
        referer: Option<&'static str>,
        cookie: Option<&'static str>,
    ) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie,
            method: "POST",
            origin,
            path: BROWSER_STATE_RECOVERY_PATH,
            referer,
            request_id: None,
            url: Some("https://tuturuuu.localhost/~recover-browser-state"),
        }
    }

    #[test]
    fn healthz_reports_runtime() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/healthz"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body["ok"], true);
        assert_eq!(response.body["runtime"], "rust");
    }

    #[test]
    fn legacy_api_health_route_is_migrated() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/api/health"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some("no-store"));
        assert_eq!(response.body["status"], "ok");
    }

    #[test]
    fn legacy_api_health_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", "/api/health"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(response.body["error"], "method not allowed");
    }

    #[test]
    fn legacy_calendar_mock_route_is_migrated() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/api/v1/calendar/mock"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["data"].as_array().unwrap().len(), 3);
        assert_eq!(response.body["data"][0]["id"], 1);
        assert_eq!(response.body["data"][0]["title"], "Event 1");
        assert_eq!(response.body["data"][0]["start_at"], "2023-10-01T10:00:00Z");
        assert_eq!(response.body["data"][0]["end_at"], "2023-10-01T11:00:00Z");
    }

    #[test]
    fn legacy_calendar_mock_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", "/api/v1/calendar/mock"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(response.body["error"], "method not allowed");
    }

    #[test]
    fn legacy_user_field_types_route_is_migrated() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", USER_FIELD_TYPES_PATH),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(
            response.body,
            json!([
                { "id": "TEXT" },
                { "id": "NUMBER" },
                { "id": "BOOLEAN" },
                { "id": "DATE" },
                { "id": "DATETIME" },
            ])
        );
    }

    #[test]
    fn legacy_user_field_types_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", USER_FIELD_TYPES_PATH),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(response.body["error"], "method not allowed");
    }

    #[test]
    fn legacy_auth_cors_options_routes_are_migrated() {
        for path in AUTH_CORS_PREFLIGHT_PATHS {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request("OPTIONS", path),
            );

            assert_eq!(response.status, 204, "{path}");
            assert!(response.body_empty, "{path}");
            assert_eq!(response.content_type, None, "{path}");
            assert_eq!(
                header_value(&response, "access-control-allow-origin"),
                Some("*"),
                "{path}"
            );
            assert_eq!(
                header_value(&response, "access-control-allow-methods"),
                Some(MOBILE_AUTH_CORS_ALLOW_METHODS),
                "{path}"
            );
            assert_eq!(
                header_value(&response, "access-control-allow-headers"),
                Some(MOBILE_AUTH_CORS_ALLOW_HEADERS),
                "{path}"
            );
            assert_eq!(
                header_value(&response, "access-control-max-age"),
                Some(MOBILE_AUTH_CORS_MAX_AGE),
                "{path}"
            );
        }
    }

    #[test]
    fn legacy_auth_cors_preflight_routes_do_not_claim_auth_methods() {
        for (method, path) in [
            ("POST", "/api/v1/auth/password-login"),
            ("POST", "/api/v1/auth/mobile/password-login"),
            ("POST", "/api/v1/auth/otp/send"),
            ("POST", "/api/v1/auth/otp/verify"),
            ("GET", "/api/v1/mobile/version-check"),
        ] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 404, "{method} {path}");
            assert_eq!(response.body["error"], "not found", "{method} {path}");
        }
    }

    #[test]
    fn legacy_bare_auth_options_routes_are_migrated() {
        for path in [
            "/api/v1/auth/qr-login/challenges",
            "/api/v1/auth/qr-login/challenges/challenge-123",
            "/api/v1/auth/qr-login/challenges/challenge-123/approve",
            "/api/v1/auth/mfa/mobile/challenges",
            "/api/v1/auth/mfa/mobile/challenges/challenge-123",
            "/api/v1/auth/mfa/mobile/challenges/challenge-123/approve",
            "/api/v1/auth/mfa/mobile/approvals",
        ] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request("OPTIONS", path),
            );

            assert_eq!(response.status, 204, "{path}");
            assert!(response.body_empty, "{path}");
            assert_eq!(response.content_type, None, "{path}");
            assert!(response.headers.is_empty(), "{path}");
        }
    }

    #[test]
    fn legacy_bare_auth_preflight_routes_do_not_claim_auth_methods() {
        for (method, path) in [
            ("POST", "/api/v1/auth/qr-login/challenges"),
            ("GET", "/api/v1/auth/qr-login/challenges/challenge-123"),
            (
                "POST",
                "/api/v1/auth/qr-login/challenges/challenge-123/approve",
            ),
            ("POST", "/api/v1/auth/mfa/mobile/challenges"),
            ("GET", "/api/v1/auth/mfa/mobile/challenges/challenge-123"),
            (
                "POST",
                "/api/v1/auth/mfa/mobile/challenges/challenge-123/approve",
            ),
            ("GET", "/api/v1/auth/mfa/mobile/approvals"),
        ] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 404, "{method} {path}");
            assert_eq!(response.body["error"], "not found", "{method} {path}");
        }
    }

    #[test]
    fn legacy_webgl_package_upload_options_route_is_bare_without_origin() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(
                "OPTIONS",
                "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
            ),
        );

        assert_eq!(response.status, 204);
        assert!(response.body_empty);
        assert_eq!(response.content_type, None);
        assert!(response.headers.is_empty());
    }

    #[test]
    fn legacy_webgl_package_upload_options_allows_static_cms_origins() {
        for origin in ["https://cms.tuturuuu.com", "http://localhost:7811"] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request_with_origin(
                    "OPTIONS",
                    "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
                    origin,
                ),
            );

            assert_eq!(response.status, 204, "{origin}");
            assert!(response.body_empty, "{origin}");
            assert_eq!(
                header_value(&response, "access-control-allow-origin"),
                Some(origin),
                "{origin}"
            );
            assert_eq!(
                header_value(&response, "access-control-allow-credentials"),
                Some("true"),
                "{origin}"
            );
            assert_eq!(
                header_value(&response, "access-control-allow-methods"),
                Some(WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_METHODS),
                "{origin}"
            );
            assert_eq!(
                header_value(&response, "access-control-allow-headers"),
                Some(WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_HEADERS),
                "{origin}"
            );
            assert_eq!(header_value(&response, "vary"), Some("Origin"), "{origin}");
        }
    }

    #[test]
    fn legacy_webgl_package_upload_options_allows_configured_cms_origins() {
        let mut config = BackendConfig::new("test", "backend");
        config.cms_app_url = "https://cms-preview.example.com/editor".to_owned();
        config.next_public_cms_app_url = "https://cms-public.example.com/app".to_owned();

        for origin in [
            "https://cms-preview.example.com",
            "https://cms-public.example.com",
        ] {
            let response = route_request(
                &config,
                request_with_origin(
                    "OPTIONS",
                    "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
                    origin,
                ),
            );

            assert_eq!(response.status, 204, "{origin}");
            assert_eq!(
                header_value(&response, "access-control-allow-origin"),
                Some(origin),
                "{origin}"
            );
            assert_eq!(header_value(&response, "vary"), Some("Origin"), "{origin}");
        }
    }

    #[test]
    fn legacy_webgl_package_upload_options_rejects_untrusted_origins() {
        let mut config = BackendConfig::new("test", "backend");
        config.cms_app_url = "not a url".to_owned();
        config.next_public_cms_app_url = "https://cms-public.example.com/app".to_owned();

        for origin in [
            "https://cms-public.example.net",
            "https://cms.tuturuuu.com.evil.example",
            "not a url",
        ] {
            let response = route_request(
                &config,
                request_with_origin(
                    "OPTIONS",
                    "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
                    origin,
                ),
            );

            assert_eq!(response.status, 204, "{origin}");
            assert!(response.body_empty, "{origin}");
            assert!(response.headers.is_empty(), "{origin}");
        }
    }

    #[test]
    fn legacy_webgl_package_upload_preflight_does_not_claim_put() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(
                "PUT",
                "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload",
            ),
        );

        assert_eq!(response.status, 404);
        assert_eq!(response.body["error"], "not found");
    }

    #[test]
    fn legacy_webgl_package_upload_preflight_requires_exact_path_shape() {
        for path in [
            "/api/v1/workspaces/external-projects/webgl-packages/upload",
            "/api/v1/workspaces/ws-123/external-projects/webgl-packages/upload/extra",
            "/api/v1/workspaces/ws-123/external-projects/webgl-package/upload",
        ] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request_with_origin("OPTIONS", path, "https://cms.tuturuuu.com"),
            );

            assert_eq!(response.status, 404, "{path}");
            assert_eq!(response.body["error"], "not found", "{path}");
        }
    }

    #[test]
    fn legacy_group_check_email_route_is_disabled() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(
                "POST",
                "/api/v1/workspaces/acme/user-groups/group-1/group-checks/post-1/email",
            ),
        );

        assert_eq!(response.status, 410);
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["message"], DISABLED_GROUP_CHECK_EMAIL_MESSAGE);
    }

    #[test]
    fn legacy_group_check_email_route_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request(
                "GET",
                "/api/v1/workspaces/acme/user-groups/group-1/group-checks/post-1/email",
            ),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("POST"));
        assert_eq!(response.body["error"], "method not allowed");
    }

    #[test]
    fn legacy_browser_recovery_get_returns_no_store_html() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", BROWSER_STATE_RECOVERY_PATH),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.content_type, Some("text/html; charset=utf-8"));
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert!(
            response
                .headers
                .iter()
                .any(|(name, value)| *name == "cdn-cache-control" && value == "no-store")
        );
        assert!(
            response
                .body_text
                .as_deref()
                .unwrap()
                .contains(r#"<form method="post" action="/~recover-browser-state">"#)
        );
    }

    #[test]
    fn legacy_browser_recovery_post_redirects_and_clears_matching_auth_cookies() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            browser_recovery_request(
                Some("https://tuturuuu.localhost"),
                None,
                Some("sb-project-ref-auth-token=abc; theme=dark; sb-project-ref-auth-token.0=def"),
            ),
        );

        assert_eq!(response.status, 307);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert!(response.body_empty);
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "location" && value == "https://tuturuuu.localhost/login?browserStateReset=1"
        }));
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "clear-site-data" && value == BROWSER_STATE_RECOVERY_CLEAR_SITE_DATA
        }));

        let set_cookie_headers: Vec<_> = response
            .headers
            .iter()
            .filter(|(name, _value)| *name == "set-cookie")
            .map(|(_name, value)| value.as_str())
            .collect();

        assert_eq!(set_cookie_headers.len(), 2);
        assert!(
            set_cookie_headers
                .iter()
                .any(|value| value.starts_with("sb-project-ref-auth-token=;"))
        );
        assert!(
            set_cookie_headers
                .iter()
                .any(|value| value.starts_with("sb-project-ref-auth-token.0=;"))
        );
        assert!(
            set_cookie_headers
                .iter()
                .all(|value| value.contains("Max-Age=0") && value.contains("Path=/"))
        );
    }

    #[test]
    fn legacy_browser_recovery_post_accepts_same_origin_referer() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            browser_recovery_request(None, Some("https://tuturuuu.localhost/settings"), None),
        );

        assert_eq!(response.status, 307);
        assert!(
            response
                .headers
                .iter()
                .any(|(name, _value)| *name == "clear-site-data")
        );
    }

    #[test]
    fn legacy_browser_recovery_post_rejects_cross_origin_requests() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            browser_recovery_request(Some("https://evil.example"), None, None),
        );

        assert_eq!(response.status, 403);
        assert_eq!(
            response.body["error"],
            "Browser state reset requires same-origin confirmation"
        );
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
    }

    #[test]
    fn legacy_browser_recovery_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("PUT", BROWSER_STATE_RECOVERY_PATH),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET, POST"));
    }

    #[test]
    fn legacy_language_cookie_post_requires_locale() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body("POST", "/api/v1/infrastructure/languages", "{}"),
        );

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], "Locale is required");
        assert!(
            !response
                .headers
                .iter()
                .any(|(name, _value)| *name == "set-cookie")
        );
    }

    #[test]
    fn legacy_language_cookie_post_rejects_unsupported_locale() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body(
                "POST",
                "/api/v1/infrastructure/languages",
                r#"{"locale":"fr"}"#,
            ),
        );

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], "Locale is not supported");
    }

    #[test]
    fn legacy_language_cookie_post_sets_supported_locale() {
        for locale in ["en", "vi"] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request_with_body(
                    "POST",
                    "/api/v1/infrastructure/languages",
                    if locale == "en" {
                        r#"{"locale":"en"}"#
                    } else {
                        r#"{"locale":"vi"}"#
                    },
                ),
            );

            assert_eq!(response.status, 200);
            assert_eq!(response.body["message"], "Success");
            assert!(response.headers.iter().any(|(name, value)| {
                *name == "set-cookie" && value == &format!("{LOCALE_COOKIE_NAME}={locale}; Path=/")
            }));
        }
    }

    #[test]
    fn legacy_language_cookie_delete_clears_cookie() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("DELETE", "/api/v1/infrastructure/languages"),
        );

        assert_eq!(response.status, 200);
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie" && value == &format!("{LOCALE_COOKIE_NAME}={COOKIE_DELETE_VALUE}")
        }));
    }

    #[test]
    fn legacy_language_cookie_route_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/api/v1/infrastructure/languages"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("POST, DELETE"));
    }

    #[test]
    fn legacy_sidebar_cookie_post_requires_collapsed_value() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body("POST", "/api/v1/infrastructure/sidebar", "{}"),
        );

        assert_eq!(response.status, 500);
        assert_eq!(response.body["message"], "Collapse is required");
    }

    #[test]
    fn legacy_sidebar_cookie_post_sets_raw_json_value() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body(
                "POST",
                "/api/v1/infrastructure/sidebar",
                r#"{"collapsed":false}"#,
            ),
        );

        assert_eq!(response.status, 200);
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie"
                && value == &format!("{SIDEBAR_COLLAPSED_COOKIE_NAME}=false; Path=/")
        }));
    }

    #[test]
    fn legacy_sidebar_cookie_delete_clears_cookie() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("DELETE", "/api/v1/infrastructure/sidebar"),
        );

        assert_eq!(response.status, 200);
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie"
                && value == &format!("{SIDEBAR_COLLAPSED_COOKIE_NAME}={COOKIE_DELETE_VALUE}")
        }));
    }

    #[test]
    fn legacy_sidebar_sizes_cookie_post_requires_both_sizes() {
        for body in [r#"{"sidebar":25}"#, r#"{"main":75}"#, "{}"] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request_with_body("POST", "/api/v1/infrastructure/sidebar/sizes", body),
            );

            assert_eq!(response.status, 500);
            assert_eq!(response.body["message"], "Sizes is required");
        }
    }

    #[test]
    fn legacy_sidebar_sizes_cookie_post_sets_both_cookies() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_body(
                "POST",
                "/api/v1/infrastructure/sidebar/sizes",
                r#"{"sidebar":28,"main":"72"}"#,
            ),
        );

        assert_eq!(response.status, 200);
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie" && value == &format!("{SIDEBAR_SIZE_COOKIE_NAME}=28; Path=/")
        }));
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie" && value == &format!("{MAIN_CONTENT_SIZE_COOKIE_NAME}=72; Path=/")
        }));
    }

    #[test]
    fn legacy_sidebar_sizes_cookie_delete_only_clears_sidebar_size_cookie() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("DELETE", "/api/v1/infrastructure/sidebar/sizes"),
        );

        assert_eq!(response.status, 200);
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "set-cookie"
                && value == &format!("{SIDEBAR_SIZE_COOKIE_NAME}={COOKIE_DELETE_VALUE}")
        }));
        assert!(
            !response
                .headers
                .iter()
                .any(|(_name, value)| value.starts_with(MAIN_CONTENT_SIZE_COOKIE_NAME))
        );
    }

    #[test]
    fn legacy_workspace_slides_collection_routes_return_not_implemented() {
        for method in ["GET", "POST"] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request(method, "/api/v1/workspaces/acme/slides"),
            );

            assert_eq!(response.status, 501);
            assert_eq!(response.body["message"], "Not implemented");
        }
    }

    #[test]
    fn legacy_workspace_slides_collection_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("PUT", "/api/v1/workspaces/acme/slides"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET, POST"));
    }

    #[test]
    fn legacy_workspace_slide_item_routes_return_not_implemented() {
        for method in ["PUT", "DELETE"] {
            let response = route_request(
                &BackendConfig::new("test", "backend"),
                request(method, "/api/v1/workspaces/acme/slides/slide-123"),
            );

            assert_eq!(response.status, 501);
            assert_eq!(response.body["message"], "Not implemented");
        }
    }

    #[test]
    fn legacy_workspace_slide_item_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/api/v1/workspaces/acme/slides/slide-123"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("PUT, DELETE"));
    }

    #[test]
    fn legacy_grouped_score_names_migration_is_disabled_in_dev() {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH),
        );

        assert_eq!(response.status, 410);
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
        assert_eq!(
            response.body["message"],
            GROUPED_SCORE_NAMES_MIGRATION_DISABLED_MESSAGE
        );
    }

    #[test]
    fn legacy_grouped_score_names_migration_requires_dev_mode() {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH),
        );

        assert_eq!(response.status, 403);
        assert_eq!(response.body["error"], "Forbidden");
        assert_eq!(
            response.body["message"],
            "Infrastructure migration routes are only accessible in development mode"
        );
        assert_eq!(
            response.body["hint"],
            "These routes are intended for internal data migration and should not be used in production."
        );
    }

    #[test]
    fn legacy_grouped_score_names_migration_allows_local_e2e_bypass() {
        let mut config = BackendConfig::new("production", "backend");
        config.local_e2e_migration_access = true;

        let response = route_request(&config, request("PUT", GROUPED_SCORE_NAMES_MIGRATION_PATH));

        assert_eq!(response.status, 410);
        assert_eq!(response.body["error"], "MIGRATION_DISABLED");
    }

    #[test]
    fn legacy_grouped_score_names_migration_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("development", "backend"),
            request("GET", GROUPED_SCORE_NAMES_MIGRATION_PATH),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("PUT"));
        assert_eq!(response.body["error"], "method not allowed");
    }

    #[test]
    fn legacy_well_known_routes_return_cacheable_empty_404() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/.well-known/appspecific/com.chrome.devtools.json"),
        );

        assert_eq!(response.status, 404);
        assert_eq!(response.cache_control, Some(WELL_KNOWN_CACHE_CONTROL));
        assert_eq!(response.content_type, None);
        assert!(response.body_empty);
    }

    #[test]
    fn legacy_well_known_head_routes_return_cacheable_empty_404() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("HEAD", "/.well-known/security.txt"),
        );

        assert_eq!(response.status, 404);
        assert_eq!(response.cache_control, Some(WELL_KNOWN_CACHE_CONTROL));
        assert_eq!(response.content_type, None);
        assert!(response.body_empty);
    }

    #[test]
    fn legacy_well_known_routes_reject_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", "/.well-known/security.txt"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET, HEAD"));
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert!(!response.body_empty);
    }

    #[test]
    fn legacy_serwist_worker_route_decommissions_old_registration() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", SERWIST_SERVICE_WORKER_PATH),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.content_type, Some("application/javascript"));
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert!(response.headers.iter().any(|(name, value)| {
            *name == "cdn-cache-control" && value == NO_STORE_CDN_CACHE_CONTROL
        }));
        assert!(
            response
                .headers
                .iter()
                .any(|(name, value)| { *name == "service-worker-allowed" && value == "/" })
        );
        let body = response.body_text.as_deref().unwrap();
        assert!(body.contains("self.skipWaiting()"));
        assert!(body.contains("self.registration.unregister()"));
    }

    #[test]
    fn legacy_serwist_route_serves_deterministic_source_map_metadata() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", SERWIST_SOURCE_MAP_PATH),
        );

        assert_eq!(response.status, 200);
        assert_eq!(
            response.content_type,
            Some("application/json; charset=UTF-8")
        );
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(
            response.body_text.as_deref(),
            Some(SERWIST_DECOMMISSION_SOURCE_MAP)
        );
    }

    #[test]
    fn legacy_serwist_route_rejects_unsupported_methods() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", SERWIST_SERVICE_WORKER_PATH),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(response.body["error"], "method not allowed");
    }

    #[test]
    fn legacy_serwist_route_returns_empty_404_for_unknown_artifacts() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/serwist/unknown.js"),
        );

        assert_eq!(response.status, 404);
        assert!(response.body_empty);
        assert_eq!(response.content_type, None);
    }

    #[test]
    fn json_responses_advertise_security_headers() {
        let expected = [
            (
                "content-security-policy",
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
            ),
            ("referrer-policy", "no-referrer"),
            ("x-content-type-options", "nosniff"),
            ("x-frame-options", "DENY"),
        ];

        assert_eq!(json_security_headers(), expected.as_slice());
    }

    #[test]
    fn readyz_requires_internal_token() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", "/readyz"),
        );

        assert_eq!(response.status, 503);
        assert_eq!(response.body["ok"], false);
    }

    #[test]
    fn migration_status_is_runtime_neutral() {
        let response = route_request(
            &backend_config_with_internal_token(),
            authorized_request("GET", "/api/migration/status"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body["ok"], true);
        assert_eq!(response.body["backend"]["runtime"], "rust");
        assert_eq!(
            response.body["routeOwnership"]["manifest"],
            MIGRATION_MANIFEST_PATH
        );
    }

    #[test]
    fn migration_manifest_endpoint_returns_checked_inventory() {
        let manifest = parse_route_manifest().unwrap();
        let response = route_request(
            &backend_config_with_internal_token(),
            authorized_request("GET", "/api/migration/manifest"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(
            response.body["summary"]["total"].as_u64(),
            Some(manifest.summary.total as u64)
        );
        assert_eq!(
            response.body["summary"]["total"].as_u64(),
            Some(response.body["routes"].as_array().unwrap().len() as u64)
        );
        assert_eq!(
            response.body["summary"]["methodCounts"]["GET"].as_u64(),
            manifest
                .summary
                .method_counts
                .get("GET")
                .map(|count| *count as u64)
        );
        assert!(
            response.body["routes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|route| route["routePath"] == "/api/health"
                    && route["methods"].as_array().unwrap().len() == 1
                    && route["methods"][0] == "GET")
        );
        assert!(
            response.body["routes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|route| route["routePath"] == "/serwist/:path"
                    && route["methods"].as_array().unwrap().len() == 1
                    && route["methods"][0] == "GET"
                    && route["status"] == "migrated")
        );
        assert!(
            response.body["routes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|route| route["routePath"] == "/~recover-browser-state"
                    && route["methods"].as_array().unwrap().len() == 2
                    && route["methods"][0] == "GET"
                    && route["methods"][1] == "POST"
                    && route["status"] == "migrated")
        );
        assert!(
            response.body["routes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|route| route["routePath"]
                    == "/api/v1/infrastructure/migrate/grouped-score-names"
                    && route["methods"].as_array().unwrap().len() == 1
                    && route["methods"][0] == "PUT"
                    && route["status"] == "migrated")
        );
        assert!(
            response.body["routes"]
                .as_array()
                .unwrap()
                .iter()
                .any(
                    |route| route["routePath"] == "/api/workspaces/:wsId/categories"
                        && route["status"] == "accepted-removal"
                )
        );
        assert_eq!(
            response.body["generatedBy"],
            "scripts/tanstack-migration-manifest.js"
        );
    }

    #[test]
    fn migration_cutover_gates_block_while_legacy_routes_remain() {
        let manifest = parse_route_manifest().unwrap();
        let counts = migration_route_counts(&manifest.routes);
        let response = route_request(
            &backend_config_with_internal_token(),
            authorized_request("GET", "/api/migration/cutover-gates"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body["ok"], false);
        assert_eq!(
            response.body["manifest"],
            "apps/tanstack-web/migration/route-manifest.json"
        );
        assert_eq!(
            response.body["summary"]["total"].as_u64(),
            Some(manifest.summary.total as u64)
        );
        assert_eq!(
            response.body["counts"]["acceptedRemoval"].as_u64(),
            Some(counts.accepted_removal as u64)
        );
        assert_eq!(
            response.body["counts"]["legacyNext"].as_u64(),
            Some(counts.legacy_next as u64)
        );
        assert_eq!(
            response.body["counts"]["migrated"].as_u64(),
            Some(counts.migrated as u64)
        );
        assert!(
            response.body["gates"]
                .as_array()
                .unwrap()
                .iter()
                .any(|gate| gate["id"] == "backend-owned-routes-mapped" && gate["ok"] == true)
        );
    }

    #[test]
    fn migration_progress_groups_remaining_route_ownership() {
        let manifest = parse_route_manifest().unwrap();
        let progress = route_manifest_progress(&manifest.routes);
        let rust_backend_progress = progress
            .by_owner
            .iter()
            .find(|bucket| bucket.key == "rust-backend")
            .unwrap();
        let response = route_request(
            &backend_config_with_internal_token(),
            authorized_request("GET", "/api/migration/progress"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body["ok"], false);
        assert_eq!(
            response.body["manifest"],
            "apps/tanstack-web/migration/route-manifest.json"
        );
        assert_eq!(
            response.body["progress"]["totals"]["acceptedRemoval"].as_u64(),
            Some(progress.totals.accepted_removal as u64)
        );
        assert_eq!(
            response.body["progress"]["totals"]["remaining"].as_u64(),
            Some(progress.totals.remaining as u64)
        );
        assert_eq!(
            response.body["progress"]["totals"]["migrated"].as_u64(),
            Some(progress.totals.migrated as u64)
        );
        assert_eq!(
            response.body["progress"]["byOwner"][0]["key"],
            "rust-backend"
        );
        assert_eq!(
            response.body["progress"]["byOwner"][0]["remaining"].as_u64(),
            Some(rust_backend_progress.remaining as u64)
        );
        assert_eq!(response.body["progress"]["byKind"][0]["key"], "api");
        assert!(
            response.body["progress"]["topLegacyRoutes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|route| route["targetOwner"] == "rust-backend" && route["methods"].is_array())
        );
    }

    #[test]
    fn migration_inventory_endpoints_require_internal_authorization() {
        let mut config = backend_config_with_internal_token();

        for path in [
            "/api/migration/status",
            "/api/migration/manifest",
            "/api/migration/progress",
            "/api/migration/cutover-gates",
        ] {
            let response = route_request(&config, request("GET", path));

            assert_eq!(response.status, 401);
            assert_eq!(response.body["error"], "unauthorized");
        }

        config.internal_token.clear();
        let response = route_request(&config, request("GET", "/api/migration/status"));

        assert_eq!(response.status, 503);
        assert_eq!(
            response.body["error"],
            "backend internal token is not configured"
        );
    }

    #[test]
    fn protected_jobs_require_authorization() {
        let config = backend_config_with_internal_token();

        let response = route_request(&config, request("POST", "/internal/jobs/noop"));

        assert_eq!(response.status, 401);
    }

    #[test]
    fn protected_jobs_reject_unknown_jobs() {
        let config = backend_config_with_internal_token();

        let response = route_request(
            &config,
            BackendRequest {
                authorization: Some("Bearer secret"),
                body_text: None,
                cookie: None,
                method: "POST",
                origin: None,
                path: "/internal/jobs/unknown",
                referer: None,
                request_id: Some("request-123"),
                url: Some("https://tuturuuu.localhost/internal/jobs/unknown"),
            },
        );

        assert_eq!(response.status, 404);
        assert_eq!(response.body["requestId"], "request-123");
    }

    #[test]
    fn noop_job_accepts_authorized_requests() {
        let mut config = BackendConfig::new("test", "backend");
        config.internal_token = "secret".to_owned();

        let response = route_request(
            &config,
            BackendRequest {
                authorization: Some("Bearer secret"),
                body_text: None,
                cookie: None,
                method: "POST",
                origin: None,
                path: "/internal/jobs/noop",
                referer: None,
                request_id: Some("request-123"),
                url: Some("https://tuturuuu.localhost/internal/jobs/noop"),
            },
        );

        assert_eq!(response.status, 202);
        assert_eq!(response.body["accepted"], true);
        assert_eq!(response.body["job"], "noop");
        assert_eq!(response.body["requestId"], "request-123");
    }

    #[test]
    fn unsupported_methods_report_allow_header() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", "/healthz"),
        );

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
    }
}
