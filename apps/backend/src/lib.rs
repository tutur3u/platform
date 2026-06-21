use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

mod contact;
mod mobile_version;
mod outbound;

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
const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024;
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
const OBSOLETE_INFRASTRUCTURE_MIGRATION_DISABLED_MESSAGE: &str = "This infrastructure batch migration endpoint is no longer available. Use maintained database migrations or local backfill scripts instead.";
const OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE: &str = "This workspace migration endpoint is no longer available. Use maintained database migrations or local backfill scripts instead.";
const OBSOLETE_INFRASTRUCTURE_MIGRATION_POST_ONLY: [&str; 1] = ["ensure-platform-users"];
const OBSOLETE_INFRASTRUCTURE_MIGRATION_GET_PUT_PATCH: [&str; 3] = [
    "wallet-transactions",
    "workspace-settings",
    "workspace-users",
];
const OBSOLETE_INFRASTRUCTURE_MIGRATION_GET_PUT: [&str; 37] = [
    "class-scores",
    "class-sessions",
    "credit-wallets",
    "email-blacklist",
    "finance-budgets",
    "finance-invoice-products",
    "finance-invoice-promotions",
    "finance-invoice-transaction-links",
    "finance-invoice-user-groups",
    "finance-invoices",
    "inventory-batch-products",
    "inventory-batches",
    "inventory-manufacturers",
    "inventory-products",
    "inventory-suppliers",
    "post-email-queue",
    "sent-emails",
    "student-feedbacks",
    "user-coupons",
    "user-group-post-checks",
    "wallet-transaction-tags",
    "wallet-types",
    "workspace-configs",
    "workspace-user-fields",
    "workspace-user-group-session-files",
    "workspace-user-group-session-series",
    "workspace-user-group-session-tag-links",
    "workspace-user-group-session-tags",
    "workspace-user-group-sessions",
    "workspace-user-group-tag-groups",
    "workspace-user-group-tags",
    "workspace-user-groups-users",
    "workspace-user-groups",
    "workspace-user-linked-users",
    "workspace-user-status-changes",
    "workspace-wallet-transfers",
    "workspace-wallets",
];
const OBSOLETE_INFRASTRUCTURE_MIGRATION_PUT_ONLY: [&str; 25] = [
    "bill-coupons",
    "bill-packages",
    "bills",
    "class-attendance",
    "class-members",
    "class-packages",
    "classes",
    "coupons",
    "lessons",
    "package-stock-changes",
    "packages",
    "payment-methods",
    "product-categories",
    "product-prices",
    "product-units",
    "roles",
    "score-names",
    "transaction-categories",
    "user-monthly-report-logs",
    "user-monthly-reports",
    "user-roles",
    "user-status-changes",
    "users",
    "wallets",
    "warehouses",
];
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
pub(crate) const MOBILE_AUTH_CORS_ALLOW_METHODS: &str = "GET, POST, OPTIONS";
pub(crate) const MOBILE_AUTH_CORS_ALLOW_HEADERS: &str = "Content-Type, Authorization";
pub(crate) const MOBILE_AUTH_CORS_MAX_AGE: &str = "86400";
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
const DISCORD_DAILY_REPORT_CRON_PATH: &str = "/api/cron/discord/daily-report";
const DISCORD_DAILY_REPORT_UPSTREAM_PATH: &str = "/daily-report";
const DISCORD_WOL_DAILY_REMIND_CRON_PATH: &str = "/api/cron/discord/wol/daily/remind";
const DISCORD_WOL_DAILY_REMIND_UPSTREAM_PATH: &str = "/wol-reminder";
const MISSING_CRON_SECRET_MESSAGE: &str = "CRON_SECRET or VERCEL_CRON_SECRET is not set";
const MISSING_DISCORD_APP_DEPLOYMENT_URL_MESSAGE: &str = "DISCORD_APP_DEPLOYMENT_URL is not set";
const INVALID_DISCORD_JSON_MESSAGE: &str = "Invalid JSON from Discord app";
const DISCORD_APP_REQUEST_FAILED_MESSAGE: &str = "Discord app request failed";
const RETIRED_LEGACY_API_ERROR: &str = "ENDPOINT_REMOVED";
const RETIRED_SHARE_COURSE_MESSAGE: &str =
    "This legacy shared course API has been removed. Use GET /api/v1/course?courseId=... instead.";
const RETIRED_SYNC_LOGS_MESSAGE: &str = "This legacy all-workspace sync logs API has been removed. Use workspace-scoped calendar sync monitoring instead.";
const RETIRED_SUBSCRIPTION_CROSS_CHECK_MESSAGE: &str = "This legacy monolithic subscription cross-check API has been removed. Use the phase-specific cross-check endpoints instead.";
const RETIRED_USER_SEARCH_MESSAGE: &str = "This legacy user search API has been removed. Use a maintained server-owned people search API instead.";
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
    pub app_coordination_secrets: Vec<String>,
    pub(crate) contact_data: contact::ContactDataConfig,
    pub cron_secret: String,
    pub deployment_target: String,
    pub discord_app_deployment_url: String,
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
            app_coordination_secrets: Vec::new(),
            contact_data: contact::ContactDataConfig::disabled(),
            cron_secret: String::new(),
            deployment_target: default_deployment_target().to_owned(),
            discord_app_deployment_url: String::new(),
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
        let environment = env("BACKEND_ENV", "development");

        Self {
            app_coordination_secrets: contact::app_coordination_secrets_from_env(&environment),
            contact_data: contact::contact_data_config_from_env(),
            cron_secret: cron_secret_from_env(),
            deployment_target: env("BACKEND_DEPLOYMENT_TARGET", default_deployment_target()),
            discord_app_deployment_url: env("DISCORD_APP_DEPLOYMENT_URL", "")
                .trim()
                .trim_end_matches('/')
                .to_owned(),
            environment,
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

pub(crate) async fn handle_backend_request(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> BackendResponse {
    if let Some(response) =
        mobile_version::handle_mobile_version_route(config, request, outbound).await
    {
        return response;
    }

    if let Some(response) = contact::handle_contact_route(config, request, outbound).await {
        return response;
    }

    if let Some(response) = handle_discord_cron_proxy(config, request, outbound).await {
        return response;
    }

    route_request(config, request)
}

async fn handle_discord_cron_proxy(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl outbound::OutboundHttpClient,
) -> Option<BackendResponse> {
    let upstream_path = match request.path {
        DISCORD_DAILY_REPORT_CRON_PATH => DISCORD_DAILY_REPORT_UPSTREAM_PATH,
        DISCORD_WOL_DAILY_REMIND_CRON_PATH => DISCORD_WOL_DAILY_REMIND_UPSTREAM_PATH,
        _ => return None,
    };

    if request.method != "GET" {
        return Some(method_not_allowed(request.method, "GET"));
    }

    if config.cron_secret.is_empty() {
        return Some(no_store_response(json_response(
            500,
            json!({
                "ok": false,
                "error": MISSING_CRON_SECRET_MESSAGE,
            }),
        )));
    }

    let expected_authorization = format!("Bearer {}", config.cron_secret);

    if !constant_time_eq(
        request.authorization.unwrap_or_default().as_bytes(),
        expected_authorization.as_bytes(),
    ) {
        return Some(no_store_response(json_response(
            401,
            json!({
                "ok": false,
            }),
        )));
    }

    if config.discord_app_deployment_url.is_empty() {
        return Some(no_store_response(json_response(
            500,
            json!({
                "ok": false,
                "error": MISSING_DISCORD_APP_DEPLOYMENT_URL_MESSAGE,
            }),
        )));
    }

    let upstream_url = format!("{}{}", config.discord_app_deployment_url, upstream_path);
    let upstream_request =
        outbound::OutboundRequest::new(outbound::OutboundMethod::Post, &upstream_url)
            .with_header("Content-Type", APPLICATION_JSON)
            .with_header("Authorization", &expected_authorization);

    let upstream_response = match outbound.send(upstream_request).await {
        Ok(response) => response,
        Err(_) => {
            return Some(no_store_response(json_response(
                502,
                json!({
                    "ok": false,
                    "error": DISCORD_APP_REQUEST_FAILED_MESSAGE,
                }),
            )));
        }
    };
    let status = upstream_response.status;
    let body = upstream_response.json::<Value>().unwrap_or_else(|_| {
        json!({
            "ok": false,
            "error": INVALID_DISCORD_JSON_MESSAGE,
        })
    });

    Some(no_store_response(json_response(status, body)))
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
    contact_data: contact::ContactDataLayerStatus,
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
        ("GET", path) if is_retired_share_course_path(path) => {
            retired_legacy_api_response(RETIRED_SHARE_COURSE_MESSAGE)
        }
        (method, path) if is_retired_share_course_path(path) => method_not_allowed(method, "GET"),
        ("GET", "/api/sync-logs") => retired_legacy_api_response(RETIRED_SYNC_LOGS_MESSAGE),
        (method, "/api/sync-logs") => method_not_allowed(method, "GET"),
        ("POST", "/api/payment/migrations/subscriptions/cross-check") => {
            retired_legacy_api_response(RETIRED_SUBSCRIPTION_CROSS_CHECK_MESSAGE)
        }
        (method, "/api/payment/migrations/subscriptions/cross-check") => {
            method_not_allowed(method, "POST")
        }
        ("GET", "/api/users/search") => retired_legacy_api_response(RETIRED_USER_SEARCH_MESSAGE),
        (method, "/api/users/search") => method_not_allowed(method, "GET"),
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
            contact_data: config.contact_data.status(),
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

fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, path),
        ("POST", "/api/v1/infrastructure/languages")
            | ("POST", "/api/v1/infrastructure/sidebar")
            | ("POST", "/api/v1/infrastructure/sidebar/sizes")
    ) || contact::should_buffer_request_body(method, path)
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn content_length_exceeds_request_body_limit(content_length: Option<&str>) -> bool {
    parse_content_length(content_length).is_some_and(|value| value > MAX_REQUEST_BODY_BYTES as u128)
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn parse_content_length(content_length: Option<&str>) -> Option<u128> {
    content_length.and_then(|value| {
        let value = value.trim();
        if value.is_empty() {
            None
        } else {
            value.parse::<u128>().ok()
        }
    })
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn content_length_is_missing_or_invalid(content_length: Option<&str>) -> bool {
    parse_content_length(content_length).is_none()
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn buffered_request_body_exceeds_limit(
    method: &str,
    path: &str,
    content_length: Option<&str>,
) -> bool {
    should_buffer_request_body(method, path)
        && content_length_exceeds_request_body_limit(content_length)
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn buffered_body_text_exceeds_request_body_limit(body_text: &str) -> bool {
    body_text.len() > MAX_REQUEST_BODY_BYTES
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct RuntimeRequestParts<'a> {
    authorization: Option<&'a str>,
    content_length: Option<&'a str>,
    cookie: Option<&'a str>,
    method: &'a str,
    origin: Option<&'a str>,
    path: &'a str,
    referer: Option<&'a str>,
    request_id: Option<&'a str>,
    url: Option<&'a str>,
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RuntimeRequestBodyPlan {
    Buffer,
    RejectLengthRequired,
    RejectTooLarge,
    Skip,
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
#[derive(Clone, Debug, Eq, PartialEq)]
enum RuntimeResponseHeaderOperation {
    Append(&'static str, String),
    Set(&'static str, String),
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn runtime_request_body_plan(parts: &RuntimeRequestParts<'_>) -> RuntimeRequestBodyPlan {
    if !should_buffer_request_body(parts.method, parts.path) {
        RuntimeRequestBodyPlan::Skip
    } else if content_length_is_missing_or_invalid(parts.content_length) {
        RuntimeRequestBodyPlan::RejectLengthRequired
    } else if buffered_request_body_exceeds_limit(parts.method, parts.path, parts.content_length) {
        RuntimeRequestBodyPlan::RejectTooLarge
    } else {
        RuntimeRequestBodyPlan::Buffer
    }
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn backend_request_from_runtime_parts<'a>(
    parts: RuntimeRequestParts<'a>,
    body_text: Option<&'a str>,
) -> BackendRequest<'a> {
    BackendRequest {
        authorization: parts.authorization,
        body_text,
        cookie: parts.cookie,
        method: parts.method,
        origin: parts.origin,
        path: parts.path,
        referer: parts.referer,
        request_id: parts.request_id,
        url: parts.url,
    }
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn runtime_response_header_operations(
    response: &BackendResponse,
) -> Vec<RuntimeResponseHeaderOperation> {
    let mut operations = Vec::new();

    if let Some(content_type) = response.content_type {
        operations.push(RuntimeResponseHeaderOperation::Set(
            "Content-Type",
            content_type.to_owned(),
        ));
    }

    if let Some(allow) = response.allow {
        operations.push(RuntimeResponseHeaderOperation::Set(
            "Allow",
            allow.to_owned(),
        ));
    }

    if let Some(cache_control) = response.cache_control {
        operations.push(RuntimeResponseHeaderOperation::Set(
            "Cache-Control",
            cache_control.to_owned(),
        ));
    }

    if response.content_type == Some(APPLICATION_JSON) {
        for &(name, value) in json_security_headers() {
            operations.push(RuntimeResponseHeaderOperation::Set(name, value.to_owned()));
        }
    }

    for (name, value) in &response.headers {
        operations.push(RuntimeResponseHeaderOperation::Append(name, value.clone()));
    }

    operations
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

fn obsolete_infrastructure_migration_response(config: &BackendConfig) -> BackendResponse {
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

fn obsolete_workspace_migration_response(config: &BackendConfig) -> BackendResponse {
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

fn retired_legacy_api_response(message: &'static str) -> BackendResponse {
    json_response(
        410,
        json!({
            "message": message,
            "error": RETIRED_LEGACY_API_ERROR,
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

#[cfg(any(
    test,
    feature = "native",
    all(feature = "worker", target_arch = "wasm32")
))]
fn request_body_too_large_response() -> BackendResponse {
    json_response(
        413,
        json!({
            "error": "request body too large",
            "maxBytes": MAX_REQUEST_BODY_BYTES,
        }),
    )
}

#[cfg(any(test, all(feature = "worker", target_arch = "wasm32")))]
fn request_body_length_required_response() -> BackendResponse {
    json_response(
        411,
        json!({
            "error": "request body content length required",
            "maxBytes": MAX_REQUEST_BODY_BYTES,
        }),
    )
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

fn is_retired_share_course_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 4
        && segments[0] == "api"
        && segments[1] == "share"
        && segments[2] == "course"
        && !segments[3].is_empty()
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

fn is_obsolete_workspace_migration_method(method: &str, path: &str) -> bool {
    obsolete_workspace_migration_allowed_methods(path).is_some_and(|allowed| {
        allowed
            .split(", ")
            .any(|allowed_method| allowed_method == method)
    })
}

fn is_obsolete_workspace_migration_path(path: &str) -> bool {
    obsolete_workspace_migration_allowed_methods(path).is_some()
}

fn obsolete_workspace_migration_allowed_methods(path: &str) -> Option<&'static str> {
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

fn is_obsolete_infrastructure_migration_method(method: &str, path: &str) -> bool {
    obsolete_infrastructure_migration_allowed_methods(path).is_some_and(|allowed| {
        allowed
            .split(", ")
            .any(|allowed_method| allowed_method == method)
    })
}

fn is_obsolete_infrastructure_migration_path(path: &str) -> bool {
    obsolete_infrastructure_migration_allowed_methods(path).is_some()
}

fn obsolete_infrastructure_migration_allowed_methods(path: &str) -> Option<&'static str> {
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
fn cron_secret_from_env() -> String {
    ["CRON_SECRET", "VERCEL_CRON_SECRET"]
        .iter()
        .filter_map(|key| std::env::var(key).ok())
        .map(|value| value.trim().to_owned())
        .find(|value| !value.is_empty())
        .unwrap_or_default()
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
        BackendConfig, BackendRequest, BackendResponse, MAX_REQUEST_BODY_BYTES,
        handle_backend_request, json_security_headers, outbound, request_body_too_large_response,
        should_buffer_request_body,
    };
    use axum::Router;
    use axum::body::{Body, to_bytes};
    use axum::extract::State;
    use axum::http::header::{
        ALLOW, AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, COOKIE, HOST, ORIGIN, REFERER,
    };
    use axum::http::{HeaderValue, Request, Response, StatusCode};
    use std::net::{IpAddr, Ipv4Addr, SocketAddr};

    #[derive(Clone)]
    struct NativeState {
        config: BackendConfig,
        outbound: outbound::NativeOutboundHttpClient,
    }

    pub fn router(config: BackendConfig) -> Router {
        Router::new().fallback(handle).with_state(NativeState {
            config,
            outbound: outbound::NativeOutboundHttpClient::default(),
        })
    }

    pub fn listen_addr(config: &BackendConfig) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::UNSPECIFIED), config.port)
    }

    pub fn healthcheck_addr(config: &BackendConfig) -> SocketAddr {
        SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), config.port)
    }

    async fn handle(State(state): State<NativeState>, request: Request<Body>) -> Response<Body> {
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
        let body_text = if should_buffer_request_body(&method, &path) {
            match buffer_native_request_body(body).await {
                Ok(body_text) => body_text,
                Err(response) => return response.into_response(),
            }
        } else {
            None
        };

        handle_backend_request(
            &state.config,
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
            &state.outbound,
        )
        .await
        .into_response()
    }

    pub(super) async fn buffer_native_request_body(
        body: Body,
    ) -> Result<Option<String>, BackendResponse> {
        let bytes = to_bytes(body, MAX_REQUEST_BODY_BYTES)
            .await
            .map_err(|_| request_body_too_large_response())?;

        Ok(String::from_utf8(bytes.to_vec()).ok())
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
        BackendConfig, BackendResponse, RuntimeRequestBodyPlan, RuntimeRequestParts,
        RuntimeResponseHeaderOperation, backend_request_from_runtime_parts,
        buffered_body_text_exceeds_request_body_limit, handle_backend_request, outbound,
        request_body_length_required_response, request_body_too_large_response,
        runtime_request_body_plan, runtime_response_header_operations,
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
        let content_length = headers.get("Content-Length")?;
        let request_parts = RuntimeRequestParts {
            authorization: authorization.as_deref(),
            content_length: content_length.as_deref(),
            cookie: cookie.as_deref(),
            method: &method,
            origin: origin.as_deref(),
            path: &path,
            referer: referer.as_deref(),
            request_id: request_id.as_deref(),
            url: Some(url.as_str()),
        };

        let body_text = match runtime_request_body_plan(&request_parts) {
            RuntimeRequestBodyPlan::RejectLengthRequired => {
                return request_body_length_required_response().into_worker_response();
            }
            RuntimeRequestBodyPlan::RejectTooLarge => {
                return request_body_too_large_response().into_worker_response();
            }
            RuntimeRequestBodyPlan::Buffer => match request.text().await.ok() {
                Some(body_text) if buffered_body_text_exceeds_request_body_limit(&body_text) => {
                    return request_body_too_large_response().into_worker_response();
                }
                body_text => body_text,
            },
            RuntimeRequestBodyPlan::Skip => None,
        };

        let outbound = outbound::WorkerFetchOutboundHttpClient;

        handle_backend_request(
            &config,
            backend_request_from_runtime_parts(request_parts, body_text.as_deref()),
            &outbound,
        )
        .await
        .into_worker_response()
    }

    fn worker_config(env: &Env) -> BackendConfig {
        let environment = var(env, "BACKEND_ENV", "production");

        BackendConfig {
            app_coordination_secrets: app_coordination_secrets_from_worker_env(env, &environment),
            contact_data: contact_data_config_from_worker_env(env),
            cron_secret: cron_secret_from_worker_env(env),
            deployment_target: "cloudflare-workers".to_owned(),
            discord_app_deployment_url: var(env, "DISCORD_APP_DEPLOYMENT_URL", "")
                .trim()
                .trim_end_matches('/')
                .to_owned(),
            environment,
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

    fn cron_secret_from_worker_env(env: &Env) -> String {
        ["CRON_SECRET", "VERCEL_CRON_SECRET"]
            .iter()
            .map(|key| var(env, key, ""))
            .map(|value| value.trim().to_owned())
            .find(|value| !value.is_empty())
            .unwrap_or_default()
    }

    fn app_coordination_secrets_from_worker_env(env: &Env, environment: &str) -> Vec<String> {
        let mut secrets = Vec::new();

        for key in super::contact::APP_COORDINATION_SECRET_KEYS {
            let value = var(env, key, "");
            let value = value.trim();
            if !value.is_empty() && !secrets.iter().any(|secret| secret == value) {
                secrets.push(value.to_owned());
            }
        }

        if secrets.is_empty() && !environment.trim().eq_ignore_ascii_case("production") {
            secrets.push(super::contact::LOCAL_DEVELOPMENT_APP_COORDINATION_SECRET.to_owned());
        }

        secrets
    }

    fn contact_data_config_from_worker_env(env: &Env) -> super::contact::ContactDataConfig {
        super::contact::ContactDataConfig::new(
            first_var(env, &super::contact::SUPABASE_URL_KEYS),
            first_var(env, &super::contact::SUPABASE_SERVICE_ROLE_KEY_KEYS),
        )
    }

    fn first_var(env: &Env, keys: &[&str]) -> String {
        keys.iter()
            .map(|key| var(env, key, ""))
            .find(|value| !value.trim().is_empty())
            .unwrap_or_default()
    }

    impl BackendResponse {
        fn into_worker_response(self) -> Result<Response> {
            let header_operations = runtime_response_header_operations(&self);
            let mut response = if let Some(body_text) = self.body_text {
                Response::ok(body_text)?.with_status(self.status)
            } else if self.body_empty {
                Response::empty()?.with_status(self.status)
            } else {
                Response::from_json(&self.body)?.with_status(self.status)
            };

            for operation in header_operations {
                match operation {
                    RuntimeResponseHeaderOperation::Append(name, value) => {
                        response.headers_mut().append(name, value.as_str())?;
                    }
                    RuntimeResponseHeaderOperation::Set(name, value) => {
                        response.headers_mut().set(name, value.as_str())?;
                    }
                }
            }

            Ok(response)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::contact::{
        APP_SESSION_COOKIE_NAME, APP_SESSION_SCOPE, AppCoordinationClaims,
        CONTACT_DATA_LAYER_NOT_READY_MESSAGE, CURRENT_USER_PROFILE_PATH, SUPPORT_INQUIRIES_PATH,
        verify_app_session_token,
    };
    use super::outbound::{
        OutboundError, OutboundFuture, OutboundHttpClient, OutboundMethod, OutboundRequest,
        OutboundResponse,
    };
    use super::*;
    use std::{cell::RefCell, collections::VecDeque};

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

    fn backend_config_with_app_session_secret() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config
            .app_coordination_secrets
            .push("test-app-session-secret".to_owned());
        config
    }

    fn backend_config_with_contact_data() -> BackendConfig {
        let mut config = backend_config_with_internal_token();
        config
            .app_coordination_secrets
            .push("test-app-session-secret".to_owned());
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co/",
            "test-service-role-secret",
        );
        config
    }

    fn backend_config_with_discord_cron() -> BackendConfig {
        let mut config = backend_config_with_internal_token();
        config.cron_secret = "cron-secret".to_owned();
        config.discord_app_deployment_url = "https://discord.example.test".to_owned();
        config
    }

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    struct RecordingOutboundClient {
        calls: RefCell<Vec<RecordedOutboundRequest>>,
        responses: RefCell<VecDeque<OutboundResponse>>,
    }

    impl Default for RecordingOutboundClient {
        fn default() -> Self {
            Self::with_response(200, r#"{"ok":true}"#)
        }
    }

    impl RecordingOutboundClient {
        fn with_response(status: u16, body_text: impl Into<String>) -> Self {
            Self::with_responses(vec![outbound_response(status, body_text)])
        }

        fn with_responses(responses: Vec<OutboundResponse>) -> Self {
            Self {
                calls: RefCell::new(Vec::new()),
                responses: RefCell::new(VecDeque::from(responses)),
            }
        }

        fn calls(&self) -> Vec<RecordedOutboundRequest> {
            self.calls.borrow().clone()
        }
    }

    impl OutboundHttpClient for RecordingOutboundClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            self.calls.borrow_mut().push(RecordedOutboundRequest {
                body: request.body.map(str::to_owned),
                headers: request
                    .headers
                    .iter()
                    .map(|header| (header.name.to_owned(), header.value.to_owned()))
                    .collect(),
                method: request.method,
                url: request.url.to_owned(),
            });
            let response = self
                .responses
                .borrow_mut()
                .pop_front()
                .unwrap_or_else(|| outbound_response(200, r#"{"ok":true}"#));

            Box::pin(async move { Ok(response) })
        }
    }

    fn outbound_response(status: u16, body_text: impl Into<String>) -> OutboundResponse {
        OutboundResponse {
            body_text: body_text.into(),
            headers: vec![("content-type".to_owned(), APPLICATION_JSON.to_owned())],
            status,
        }
    }

    #[tokio::test]
    async fn async_handler_preserves_pure_route_dispatch_without_outbound_calls() {
        let config = backend_config_with_internal_token();
        let outbound = RecordingOutboundClient::default();

        let response =
            handle_backend_request(&config, authorized_request("GET", "/api/health"), &outbound)
                .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body["status"], "ok");
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn outbound_client_boundary_accepts_mocked_requests() {
        let outbound = RecordingOutboundClient::default();
        let response = outbound
            .send(
                OutboundRequest::new(OutboundMethod::Post, "https://api.example.test/rpc")
                    .with_header("Content-Type", APPLICATION_JSON)
                    .with_body(r#"{"hello":"world"}"#),
            )
            .await
            .expect("mock outbound response");

        assert_eq!(
            outbound.calls(),
            vec![RecordedOutboundRequest {
                body: Some(r#"{"hello":"world"}"#.to_owned()),
                headers: vec![("Content-Type".to_owned(), APPLICATION_JSON.to_owned())],
                method: OutboundMethod::Post,
                url: "https://api.example.test/rpc".to_owned(),
            }]
        );
        assert_eq!(response.status, 200);
        assert_eq!(response.header("Content-Type"), Some(APPLICATION_JSON));

        let payload: serde_json::Value = response.json().expect("json payload");
        assert_eq!(payload["ok"], true);
    }

    #[tokio::test]
    async fn discord_cron_proxy_requires_configured_cron_secret() {
        let config = backend_config_with_internal_token();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(
            &config,
            request("GET", DISCORD_DAILY_REPORT_CRON_PATH),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 500);
        assert_eq!(response.body["ok"], false);
        assert_eq!(response.body["error"], MISSING_CRON_SECRET_MESSAGE);
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn discord_cron_proxy_rejects_wrong_bearer() {
        let config = backend_config_with_discord_cron();
        let outbound = RecordingOutboundClient::default();

        let response = handle_backend_request(
            &config,
            authorized_request("GET", DISCORD_DAILY_REPORT_CRON_PATH),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body, json!({ "ok": false }));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn discord_daily_report_cron_proxy_passes_upstream_status_body_and_auth() {
        let config = backend_config_with_discord_cron();
        let outbound =
            RecordingOutboundClient::with_response(202, r#"{"ok":true,"route":"daily-report"}"#);
        let response = handle_backend_request(
            &config,
            BackendRequest {
                authorization: Some("Bearer cron-secret"),
                ..request("GET", DISCORD_DAILY_REPORT_CRON_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 202);
        assert_eq!(response.body["ok"], true);
        assert_eq!(response.body["route"], "daily-report");
        assert_eq!(
            outbound.calls(),
            vec![RecordedOutboundRequest {
                body: None,
                headers: vec![
                    ("Content-Type".to_owned(), APPLICATION_JSON.to_owned()),
                    ("Authorization".to_owned(), "Bearer cron-secret".to_owned()),
                ],
                method: OutboundMethod::Post,
                url: "https://discord.example.test/daily-report".to_owned(),
            }]
        );
    }

    #[tokio::test]
    async fn discord_wol_cron_proxy_uses_invalid_json_fallback() {
        let config = backend_config_with_discord_cron();
        let outbound = RecordingOutboundClient::with_response(503, "not json");
        let response = handle_backend_request(
            &config,
            BackendRequest {
                authorization: Some("Bearer cron-secret"),
                ..request("GET", DISCORD_WOL_DAILY_REMIND_CRON_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 503);
        assert_eq!(response.body["ok"], false);
        assert_eq!(response.body["error"], INVALID_DISCORD_JSON_MESSAGE);
        assert_eq!(
            outbound.calls(),
            vec![RecordedOutboundRequest {
                body: None,
                headers: vec![
                    ("Content-Type".to_owned(), APPLICATION_JSON.to_owned()),
                    ("Authorization".to_owned(), "Bearer cron-secret".to_owned()),
                ],
                method: OutboundMethod::Post,
                url: "https://discord.example.test/wol-reminder".to_owned(),
            }]
        );
    }

    #[tokio::test]
    async fn discord_cron_proxy_rejects_unsupported_methods_without_outbound_call() {
        let config = backend_config_with_discord_cron();
        let outbound = RecordingOutboundClient::default();
        let response = handle_backend_request(
            &config,
            request("POST", DISCORD_DAILY_REPORT_CRON_PATH),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 405);
        assert_eq!(response.allow, Some("GET"));
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn mobile_version_check_reads_policy_and_returns_update_recommendation() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_response(
            200,
            r#"[
                {"id":"MOBILE_ANDROID_EFFECTIVE_VERSION","value":"1.3.0"},
                {"id":"MOBILE_ANDROID_MINIMUM_VERSION","value":"1.1.0"},
                {"id":"MOBILE_ANDROID_OTP_ENABLED","value":"yes"},
                {"id":"MOBILE_ANDROID_STORE_URL","value":"https://play.google.com/store/apps/details?id=example.app"}
            ]"#,
        );
        let response = handle_backend_request(
            &config,
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/mobile/version-check?platform=android&version=1.2.0"),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body["platform"], "android");
        assert_eq!(response.body["currentVersion"], "1.2.0");
        assert_eq!(response.body["effectiveVersion"], "1.3.0");
        assert_eq!(response.body["minimumVersion"], "1.1.0");
        assert_eq!(response.body["otpEnabled"], true);
        assert_eq!(
            response.body["storeUrl"],
            "https://play.google.com/store/apps/details?id=example.app"
        );
        assert_eq!(response.body["status"], "update-recommended");
        assert_eq!(response.body["shouldUpdate"], true);
        assert_eq!(response.body["requiresUpdate"], false);
        assert_eq!(
            header_value(&response, "access-control-allow-origin"),
            Some("*")
        );
        assert_eq!(
            header_value(&response, "access-control-allow-methods"),
            Some(MOBILE_AUTH_CORS_ALLOW_METHODS)
        );
        assert_eq!(
            header_value(&response, "access-control-allow-headers"),
            Some(MOBILE_AUTH_CORS_ALLOW_HEADERS)
        );
        assert_eq!(
            header_value(&response, "access-control-max-age"),
            Some(MOBILE_AUTH_CORS_MAX_AGE)
        );

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        let call = &calls[0];
        assert_eq!(call.method, OutboundMethod::Get);
        assert!(
            call.url
                .starts_with("https://project-ref.supabase.co/rest/v1/workspace_configs?")
        );
        assert!(call.url.contains("select=id%2Cvalue"));
        assert!(
            call.url
                .contains("ws_id=eq.00000000-0000-0000-0000-000000000000")
        );
        assert!(call.url.contains("MOBILE_ANDROID_EFFECTIVE_VERSION"));
        assert_eq!(
            recorded_header(call, "Authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(
            recorded_header(call, "apikey"),
            Some("test-service-role-secret")
        );
    }

    #[tokio::test]
    async fn mobile_version_check_returns_update_required_and_supported_states() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(
                200,
                r#"[
                    {"id":"MOBILE_IOS_EFFECTIVE_VERSION","value":"2.0.0"},
                    {"id":"MOBILE_IOS_MINIMUM_VERSION","value":"1.5.0"},
                    {"id":"MOBILE_IOS_STORE_URL","value":"https://apps.apple.com/app/id1"}
                ]"#,
            ),
            outbound_response(200, r#"[]"#),
        ]);
        let required = handle_backend_request(
            &config,
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.4.9"),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;
        let supported = handle_backend_request(
            &config,
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.0.0"),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(required.status, 200);
        assert_eq!(required.body["status"], "update-required");
        assert_eq!(required.body["shouldUpdate"], true);
        assert_eq!(required.body["requiresUpdate"], true);
        assert_eq!(supported.status, 200);
        assert_eq!(supported.body["status"], "supported");
        assert_eq!(supported.body["shouldUpdate"], false);
        assert_eq!(supported.body["requiresUpdate"], false);
    }

    #[tokio::test]
    async fn mobile_version_check_validates_query_without_outbound_call() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();

        for (url, message) in [
            (
                "https://tuturuuu.localhost/api/v1/mobile/version-check?version=1.2.3",
                r#"Invalid option: expected one of "ios"|"android""#,
            ),
            (
                "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios",
                "Invalid input: expected string, received null",
            ),
            (
                "https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.2",
                "Version must use x.y.z format",
            ),
        ] {
            let response = handle_backend_request(
                &config,
                BackendRequest {
                    url: Some(url),
                    ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
                },
                &outbound,
            )
            .await;

            assert_eq!(response.status, 400, "{url}");
            assert_eq!(response.body["error"], message);
            assert_eq!(
                header_value(&response, "access-control-allow-origin"),
                Some("*")
            );
        }

        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn mobile_version_check_fails_closed_when_policy_data_is_unavailable_or_invalid() {
        let outbound = RecordingOutboundClient::with_response(200, r#"[]"#);
        let unavailable = handle_backend_request(
            &BackendConfig::new("test", "backend"),
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.2.3"),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(unavailable.status, 500);
        assert_eq!(
            unavailable.body["error"],
            mobile_version::mobile_version_policy_error()
        );
        assert_eq!(outbound.calls().len(), 0);

        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_response(
            200,
            r#"[{"id":"MOBILE_IOS_EFFECTIVE_VERSION","value":"1.2.0"}]"#,
        );
        let invalid_policy = handle_backend_request(
            &config,
            BackendRequest {
                url: Some("https://tuturuuu.localhost/api/v1/mobile/version-check?platform=ios&version=1.2.3"),
                ..request("GET", mobile_version::MOBILE_VERSION_CHECK_PATH)
            },
            &outbound,
        )
        .await;

        assert_eq!(invalid_policy.status, 500);
        assert_eq!(
            invalid_policy.body["error"],
            mobile_version::mobile_version_policy_error()
        );
    }

    #[tokio::test]
    async fn mobile_version_check_rejects_unsupported_methods_but_leaves_options_route_owned() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::default();
        let rejected = handle_backend_request(
            &config,
            request("POST", mobile_version::MOBILE_VERSION_CHECK_PATH),
            &outbound,
        )
        .await;
        let options = handle_backend_request(
            &config,
            request("OPTIONS", mobile_version::MOBILE_VERSION_CHECK_PATH),
            &outbound,
        )
        .await;

        assert_eq!(rejected.status, 405);
        assert_eq!(rejected.allow, Some("GET, OPTIONS"));
        assert_eq!(options.status, 204);
        assert_eq!(
            header_value(&options, "access-control-allow-methods"),
            Some(MOBILE_AUTH_CORS_ALLOW_METHODS)
        );
        assert_eq!(outbound.calls().len(), 0);
    }

    #[test]
    fn native_outbound_client_installs_tls_provider_before_construction() {
        let _client = outbound::NativeOutboundHttpClient::default();
    }

    #[test]
    fn outbound_errors_are_display_safe() {
        let error = OutboundError::Transport("upstream unavailable".to_owned());

        assert_eq!(error.to_string(), "upstream unavailable");
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

    fn request_with_cookie(
        method: &'static str,
        path: &'static str,
        cookie: String,
    ) -> BackendRequest<'static> {
        BackendRequest {
            cookie: Some(Box::leak(cookie.into_boxed_str())),
            url: Some("https://tanstack.tuturuuu.localhost/contact"),
            ..request(method, path)
        }
    }

    fn request_with_bearer(
        method: &'static str,
        path: &'static str,
        token: String,
    ) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some(Box::leak(format!("Bearer {token}").into_boxed_str())),
            url: Some("https://tanstack.tuturuuu.localhost/contact"),
            ..request(method, path)
        }
    }

    fn app_session_claims(target_app: &str, scopes: Vec<&str>, exp: u64) -> AppCoordinationClaims {
        AppCoordinationClaims {
            aud: contact::app_coordination_token_audience().to_owned(),
            email: Some("app-session@example.com".to_owned()),
            exp,
            iat: 0,
            iss: contact::app_coordination_token_issuer().to_owned(),
            jti: "test-jti".to_owned(),
            origin_app: "web".to_owned(),
            scopes: scopes.into_iter().map(str::to_owned).collect(),
            sub: "app-session-user-1".to_owned(),
            target_app: target_app.to_owned(),
            typ: "app_coordination".to_owned(),
        }
    }

    fn app_session_token(claims: &AppCoordinationClaims) -> String {
        let encoded_header = contact::encode_app_session_part(r#"{"alg":"HS256","typ":"JWT"}"#);
        let encoded_payload =
            contact::encode_app_session_part(serde_json::to_string(claims).unwrap());
        let unsigned = format!("{encoded_header}.{encoded_payload}");
        let signature =
            contact::sign_app_coordination_content(&unsigned, "test-app-session-secret")
                .expect("test app-session signature");

        format!(
            "{}{unsigned}.{signature}",
            contact::app_coordination_token_prefix()
        )
    }

    fn valid_app_session_token() -> String {
        app_session_token(&app_session_claims(
            "platform",
            vec![APP_SESSION_SCOPE, "cli:access"],
            4_102_444_800,
        ))
    }

    fn header_value<'a>(response: &'a BackendResponse, header: &str) -> Option<&'a str> {
        response
            .headers
            .iter()
            .find(|(name, _)| *name == header)
            .map(|(_, value)| value.as_str())
    }

    fn recorded_header<'a>(request: &'a RecordedOutboundRequest, header: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(header))
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
    fn content_length_guard_matches_request_body_limit() {
        assert!(!content_length_exceeds_request_body_limit(None));
        assert!(!content_length_exceeds_request_body_limit(Some("")));
        assert!(!content_length_exceeds_request_body_limit(Some(
            "not-a-number"
        )));
        assert!(!content_length_exceeds_request_body_limit(Some("65536")));
        assert!(!content_length_exceeds_request_body_limit(Some(" 65536 ")));
        assert!(content_length_exceeds_request_body_limit(Some("65537")));
    }

    #[test]
    fn body_buffering_is_limited_to_routes_that_parse_json_payloads() {
        for path in [
            "/api/v1/infrastructure/languages",
            "/api/v1/infrastructure/sidebar",
            "/api/v1/infrastructure/sidebar/sizes",
            SUPPORT_INQUIRIES_PATH,
        ] {
            assert!(should_buffer_request_body("POST", path), "{path}");
        }

        assert!(should_buffer_request_body(
            "PATCH",
            CURRENT_USER_PROFILE_PATH
        ));
        assert!(!should_buffer_request_body(
            "POST",
            CURRENT_USER_PROFILE_PATH
        ));
        assert!(!should_buffer_request_body("PATCH", SUPPORT_INQUIRIES_PATH));

        for (method, path) in [
            ("GET", "/healthz"),
            ("GET", "/readyz"),
            ("GET", "/api/migration/manifest"),
            ("POST", "/~recover-browser-state"),
            ("POST", "/internal/jobs/noop"),
            ("GET", CURRENT_USER_PROFILE_PATH),
        ] {
            assert!(!should_buffer_request_body(method, path), "{method} {path}");
        }
    }

    #[test]
    fn oversized_body_guard_only_applies_to_buffered_routes() {
        assert!(buffered_request_body_exceeds_limit(
            "POST",
            "/api/v1/infrastructure/languages",
            Some("65537")
        ));

        for (method, path) in [
            ("GET", "/healthz"),
            ("GET", "/readyz"),
            ("GET", "/api/migration/manifest"),
            ("POST", "/~recover-browser-state"),
            ("POST", "/internal/jobs/noop"),
            ("GET", CURRENT_USER_PROFILE_PATH),
        ] {
            assert!(
                !buffered_request_body_exceeds_limit(method, path, Some("65537")),
                "{method} {path}"
            );
        }
    }

    #[test]
    fn buffered_body_text_guard_matches_request_body_limit() {
        assert!(!buffered_body_text_exceeds_request_body_limit(
            &"a".repeat(MAX_REQUEST_BODY_BYTES)
        ));
        assert!(buffered_body_text_exceeds_request_body_limit(
            &"a".repeat(MAX_REQUEST_BODY_BYTES + 1)
        ));
    }

    #[cfg(feature = "native")]
    #[tokio::test]
    async fn native_buffered_request_body_rejects_oversized_payloads() {
        use axum::body::Body;

        let response =
            native::buffer_native_request_body(Body::from(vec![b'a'; MAX_REQUEST_BODY_BYTES + 1]))
                .await
                .unwrap_err();

        assert_eq!(response.status, 413);
        assert_eq!(response.body["error"], "request body too large");
        assert_eq!(
            response.body["maxBytes"].as_u64(),
            Some(MAX_REQUEST_BODY_BYTES as u64)
        );
    }

    #[cfg(feature = "native")]
    #[tokio::test]
    async fn native_buffered_request_body_preserves_valid_payloads() {
        use axum::body::Body;

        let body_text = native::buffer_native_request_body(Body::from(r#"{"locale":"vi"}"#))
            .await
            .expect("body should buffer");

        assert_eq!(body_text.as_deref(), Some(r#"{"locale":"vi"}"#));
    }

    #[test]
    fn runtime_request_body_plan_requires_known_length_for_buffered_worker_requests() {
        for content_length in [None, Some(""), Some(" "), Some("not-a-number")] {
            let parts = RuntimeRequestParts {
                authorization: None,
                content_length,
                cookie: None,
                method: "POST",
                origin: None,
                path: "/api/v1/infrastructure/sidebar",
                referer: None,
                request_id: None,
                url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/sidebar"),
            };

            assert_eq!(
                runtime_request_body_plan(&parts),
                RuntimeRequestBodyPlan::RejectLengthRequired,
                "{content_length:?}"
            );
        }

        for content_length in [Some("0"), Some("65536"), Some(" 65536 ")] {
            let parts = RuntimeRequestParts {
                authorization: None,
                content_length,
                cookie: None,
                method: "POST",
                origin: None,
                path: "/api/v1/infrastructure/sidebar",
                referer: None,
                request_id: None,
                url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/sidebar"),
            };

            assert_eq!(
                runtime_request_body_plan(&parts),
                RuntimeRequestBodyPlan::Buffer,
                "{content_length:?}"
            );
        }
    }

    #[test]
    fn request_body_too_large_response_reports_limit() {
        let response = request_body_too_large_response();

        assert_eq!(response.status, 413);
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(response.body["error"], "request body too large");
        assert_eq!(
            response.body["maxBytes"].as_u64(),
            Some(MAX_REQUEST_BODY_BYTES as u64)
        );
    }

    #[test]
    fn request_body_length_required_response_reports_limit() {
        let response = request_body_length_required_response();

        assert_eq!(response.status, 411);
        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert_eq!(
            response.body["error"],
            "request body content length required"
        );
        assert_eq!(
            response.body["maxBytes"].as_u64(),
            Some(MAX_REQUEST_BODY_BYTES as u64)
        );
    }

    #[test]
    fn runtime_request_parts_map_to_backend_request_with_body_plan() {
        let parts = RuntimeRequestParts {
            authorization: Some("Bearer secret"),
            content_length: Some("31"),
            cookie: Some("a=1; b=2"),
            method: "POST",
            origin: Some("https://tanstack.tuturuuu.localhost"),
            path: "/api/v1/infrastructure/languages",
            referer: Some("https://tanstack.tuturuuu.localhost/settings"),
            request_id: Some("request-worker-1"),
            url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/languages"),
        };

        assert_eq!(
            runtime_request_body_plan(&parts),
            RuntimeRequestBodyPlan::Buffer
        );

        let request =
            backend_request_from_runtime_parts(parts, Some(r#"{"locale":"vi","enabled":true}"#));

        assert_eq!(
            request,
            BackendRequest {
                authorization: Some("Bearer secret"),
                body_text: Some(r#"{"locale":"vi","enabled":true}"#),
                cookie: Some("a=1; b=2"),
                method: "POST",
                origin: Some("https://tanstack.tuturuuu.localhost"),
                path: "/api/v1/infrastructure/languages",
                referer: Some("https://tanstack.tuturuuu.localhost/settings"),
                request_id: Some("request-worker-1"),
                url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/languages"),
            }
        );
    }

    #[test]
    fn runtime_request_body_plan_rejects_oversized_buffered_worker_requests() {
        let oversized = RuntimeRequestParts {
            authorization: None,
            content_length: Some("65537"),
            cookie: None,
            method: "POST",
            origin: None,
            path: "/api/v1/infrastructure/sidebar",
            referer: None,
            request_id: None,
            url: Some("https://tanstack.tuturuuu.localhost/api/v1/infrastructure/sidebar"),
        };

        assert_eq!(
            runtime_request_body_plan(&oversized),
            RuntimeRequestBodyPlan::RejectTooLarge
        );

        let unbuffered = RuntimeRequestParts {
            method: "POST",
            path: "/internal/jobs/noop",
            ..oversized
        };

        assert_eq!(
            runtime_request_body_plan(&unbuffered),
            RuntimeRequestBodyPlan::Skip
        );
    }

    #[test]
    fn runtime_response_header_operations_set_standard_headers_and_append_custom_headers() {
        let mut response =
            json_response_with_cache_control(202, json!({ "ok": true }), NO_STORE_CACHE_CONTROL);
        response.allow = Some("GET");
        response.headers.push(("set-cookie", "a=1".to_owned()));
        response.headers.push(("set-cookie", "b=2".to_owned()));

        let operations = runtime_response_header_operations(&response);

        assert_eq!(
            operations[0],
            RuntimeResponseHeaderOperation::Set("Content-Type", APPLICATION_JSON.to_owned())
        );
        assert_eq!(
            operations[1],
            RuntimeResponseHeaderOperation::Set("Allow", "GET".to_owned())
        );
        assert_eq!(
            operations[2],
            RuntimeResponseHeaderOperation::Set("Cache-Control", NO_STORE_CACHE_CONTROL.to_owned())
        );

        for &(name, value) in json_security_headers() {
            assert!(
                operations.contains(&RuntimeResponseHeaderOperation::Set(name, value.to_owned())),
                "{name}"
            );
        }

        assert_eq!(
            operations
                .iter()
                .filter(|operation| matches!(
                    operation,
                    RuntimeResponseHeaderOperation::Append("set-cookie", _)
                ))
                .count(),
            2
        );
        assert!(operations.contains(&RuntimeResponseHeaderOperation::Append(
            "set-cookie",
            "a=1".to_owned()
        )));
        assert!(operations.contains(&RuntimeResponseHeaderOperation::Append(
            "set-cookie",
            "b=2".to_owned()
        )));
    }

    #[test]
    fn runtime_response_header_operations_skip_json_security_headers_for_text() {
        let response = text_response(200, "ok", "text/plain");

        assert_eq!(
            runtime_response_header_operations(&response),
            vec![RuntimeResponseHeaderOperation::Set(
                "Content-Type",
                "text/plain".to_owned()
            )]
        );
    }

    #[test]
    fn app_session_token_verification_accepts_current_user_targets() {
        let claims = verify_app_session_token(
            &valid_app_session_token(),
            &backend_config_with_app_session_secret().app_coordination_secrets,
            contact::current_user_app_session_targets(),
            1,
        )
        .expect("valid app session");

        assert_eq!(claims.sub, "app-session-user-1");
        assert_eq!(claims.email.as_deref(), Some("app-session@example.com"));
        assert_eq!(claims.target_app, "platform");
    }

    #[test]
    fn app_session_token_verification_rejects_bad_target_scope_and_expiry() {
        let config = backend_config_with_app_session_secret();

        let bad_target = app_session_token(&app_session_claims(
            "unknown-app",
            vec![APP_SESSION_SCOPE],
            4_102_444_800,
        ));
        assert_eq!(
            verify_app_session_token(
                &bad_target,
                &config.app_coordination_secrets,
                contact::current_user_app_session_targets(),
                1,
            ),
            Err("App session target mismatch".to_owned())
        );

        let missing_scope = app_session_token(&app_session_claims(
            "platform",
            vec!["cli:access"],
            4_102_444_800,
        ));
        assert_eq!(
            verify_app_session_token(
                &missing_scope,
                &config.app_coordination_secrets,
                contact::current_user_app_session_targets(),
                1,
            ),
            Err("App session missing required scope".to_owned())
        );

        let expired =
            app_session_token(&app_session_claims("platform", vec![APP_SESSION_SCOPE], 1));
        assert_eq!(
            verify_app_session_token(
                &expired,
                &config.app_coordination_secrets,
                contact::current_user_app_session_targets(),
                1,
            ),
            Err("Token expired".to_owned())
        );
    }

    #[test]
    fn contact_data_status_reports_safe_configuration_state() {
        let configured =
            contact::ContactDataConfig::new("https://project-ref.supabase.co/", "secret-value");
        let configured_status = serde_json::to_value(configured.status()).unwrap();

        assert_eq!(configured_status["configured"], true);
        assert_eq!(configured_status["missing"], json!([]));
        assert_eq!(
            configured_status["supabaseOrigin"],
            "https://project-ref.supabase.co"
        );
        assert!(!format!("{configured:?}").contains("secret-value"));
        assert!(format!("{configured:?}").contains("<configured>"));

        let missing = contact::ContactDataConfig::disabled();
        let missing_status = serde_json::to_value(missing.status()).unwrap();

        assert_eq!(missing_status["configured"], false);
        assert_eq!(
            missing_status["missing"],
            json!(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"])
        );
        assert_eq!(missing_status["supabaseOrigin"], Value::Null);
        assert!(format!("{missing:?}").contains("<empty>"));

        let invalid = contact::ContactDataConfig::new("not-a-url", "secret-value");
        let invalid_status = serde_json::to_value(invalid.status()).unwrap();

        assert_eq!(invalid_status["configured"], false);
        assert_eq!(invalid_status["missing"], json!(["SUPABASE_URL"]));
        assert_eq!(invalid_status["supabaseOrigin"], Value::Null);
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
    fn retired_legacy_api_routes_return_terminal_removed_responses() {
        for (method, path, message) in [
            (
                "GET",
                "/api/share/course/9f7d44c7-ccab-4ff5-9b7a-25b85edda5a6",
                RETIRED_SHARE_COURSE_MESSAGE,
            ),
            ("GET", "/api/sync-logs", RETIRED_SYNC_LOGS_MESSAGE),
            (
                "POST",
                "/api/payment/migrations/subscriptions/cross-check",
                RETIRED_SUBSCRIPTION_CROSS_CHECK_MESSAGE,
            ),
            ("GET", "/api/users/search", RETIRED_USER_SEARCH_MESSAGE),
        ] {
            let response = route_request(
                &BackendConfig::new("production", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 410, "{method} {path}");
            assert_eq!(response.content_type, Some(APPLICATION_JSON));
            assert_eq!(response.body["error"], RETIRED_LEGACY_API_ERROR);
            assert_eq!(response.body["message"], message);
        }
    }

    #[test]
    fn retired_legacy_api_routes_reject_unsupported_methods() {
        for (method, path, allow) in [
            ("POST", "/api/share/course/example-course-id", "GET"),
            ("POST", "/api/sync-logs", "GET"),
            (
                "GET",
                "/api/payment/migrations/subscriptions/cross-check",
                "POST",
            ),
            ("DELETE", "/api/users/search", "GET"),
        ] {
            let response = route_request(
                &BackendConfig::new("production", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 405, "{method} {path}");
            assert_eq!(response.allow, Some(allow));
            assert_eq!(response.body["error"], "method not allowed");
        }
    }

    #[test]
    fn retired_legacy_api_routes_do_not_match_nested_maintained_paths() {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request(
                "POST",
                "/api/payment/migrations/subscriptions/cross-check/phase-1",
            ),
        );

        assert_eq!(response.status, 404);
        assert_eq!(response.body["error"], "not found");
    }

    #[test]
    fn retired_legacy_api_responses_use_json_body_shape() {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request("GET", "/api/users/search"),
        );

        assert_eq!(response.content_type, Some(APPLICATION_JSON));
        assert!(!response.body_empty);
        assert_eq!(response.body["error"], RETIRED_LEGACY_API_ERROR);
        assert_eq!(response.body["message"], RETIRED_USER_SEARCH_MESSAGE);
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
    fn current_user_profile_requires_app_session_auth() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            request("GET", CURRENT_USER_PROFILE_PATH),
        );

        assert_eq!(response.status, 401);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(response.body["message"], "Unauthorized");
    }

    #[test]
    fn current_user_profile_requires_app_coordination_secret_for_tokens() {
        let response = route_request(
            &BackendConfig::new("test", "backend"),
            request_with_bearer("GET", CURRENT_USER_PROFILE_PATH, valid_app_session_token()),
        );

        assert_eq!(response.status, 503);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(
            response.body["message"],
            "App coordination secret is not configured"
        );
    }

    #[test]
    fn current_user_profile_returns_app_session_identity_preview() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            request_with_cookie(
                "GET",
                CURRENT_USER_PROFILE_PATH,
                format!("{APP_SESSION_COOKIE_NAME}={}", valid_app_session_token()),
            ),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(
            header_value(&response, "cdn-cache-control"),
            Some("no-store")
        );
        assert_eq!(response.body["id"], "app-session-user-1");
        assert_eq!(response.body["email"], "app-session@example.com");
        assert_eq!(response.body["created_at"], "1970-01-01T00:00:00.000Z");
        assert_eq!(response.body["display_name"], Value::Null);
        assert_eq!(response.body["default_workspace_id"], Value::Null);
    }

    #[tokio::test]
    async fn current_user_profile_reads_contact_data_from_supabase() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_responses(vec![
            outbound_response(
                200,
                r#"[{"id":"app-session-user-1","display_name":"Ada","avatar_url":"https://cdn.example.test/avatar.png","created_at":"2026-06-20T00:00:00.000Z"}]"#,
            ),
            outbound_response(
                200,
                r#"[{"email":"ada@example.com","full_name":"Ada Lovelace","new_email":null,"default_workspace_id":"ws_123"}]"#,
            ),
        ]);

        let response = handle_backend_request(
            &config,
            request_with_bearer("GET", CURRENT_USER_PROFILE_PATH, valid_app_session_token()),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(NO_STORE_CACHE_CONTROL));
        assert_eq!(response.body["id"], "app-session-user-1");
        assert_eq!(response.body["email"], "ada@example.com");
        assert_eq!(response.body["display_name"], "Ada");
        assert_eq!(
            response.body["avatar_url"],
            "https://cdn.example.test/avatar.png"
        );
        assert_eq!(response.body["full_name"], "Ada Lovelace");
        assert_eq!(response.body["default_workspace_id"], "ws_123");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].method, OutboundMethod::Get);
        assert_eq!(
            calls[0].url,
            "https://project-ref.supabase.co/rest/v1/users?select=id%2Cdisplay_name%2Cavatar_url%2Ccreated_at&id=eq.app-session-user-1&limit=1"
        );
        assert_eq!(
            recorded_header(&calls[0], "apikey"),
            Some("test-service-role-secret")
        );
        assert_eq!(
            recorded_header(&calls[0], "authorization"),
            Some("Bearer test-service-role-secret")
        );
        assert_eq!(calls[1].method, OutboundMethod::Get);
        assert_eq!(
            calls[1].url,
            "https://project-ref.supabase.co/rest/v1/user_private_details?select=full_name%2Cnew_email%2Cemail%2Cdefault_workspace_id&user_id=eq.app-session-user-1&limit=1"
        );
    }

    #[test]
    fn current_user_profile_rejects_wrong_app_session_target() {
        let token = app_session_token(&app_session_claims(
            "unknown-app",
            vec![APP_SESSION_SCOPE],
            4_102_444_800,
        ));
        let response = route_request(
            &backend_config_with_app_session_secret(),
            request_with_bearer("GET", CURRENT_USER_PROFILE_PATH, token),
        );

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "App session target mismatch");
    }

    #[test]
    fn current_user_profile_patch_requires_auth_before_data_layer_placeholder() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            request_with_body(
                "PATCH",
                CURRENT_USER_PROFILE_PATH,
                r#"{"display_name":"New"}"#,
            ),
        );

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
    }

    #[test]
    fn current_user_profile_patch_requires_same_origin_for_cookie_auth() {
        let token = valid_app_session_token();
        let response = route_request(
            &backend_config_with_app_session_secret(),
            BackendRequest {
                body_text: Some(r#"{"display_name":"New"}"#),
                cookie: Some(Box::leak(
                    format!("{APP_SESSION_COOKIE_NAME}={token}").into_boxed_str(),
                )),
                method: "PATCH",
                origin: Some("https://evil.example"),
                path: CURRENT_USER_PROFILE_PATH,
                url: Some("https://tanstack.tuturuuu.localhost/contact"),
                ..request("PATCH", CURRENT_USER_PROFILE_PATH)
            },
        );

        assert_eq!(response.status, 403);
        assert_eq!(
            response.body["message"],
            "Profile updates require same-origin confirmation"
        );
    }

    #[test]
    fn current_user_profile_patch_returns_data_layer_placeholder_after_auth() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            BackendRequest {
                body_text: Some(r#"{"display_name":"New"}"#),
                origin: Some("https://tanstack.tuturuuu.localhost"),
                ..request_with_cookie(
                    "PATCH",
                    CURRENT_USER_PROFILE_PATH,
                    format!("{APP_SESSION_COOKIE_NAME}={}", valid_app_session_token()),
                )
            },
        );

        assert_eq!(response.status, 503);
        assert_eq!(response.body["code"], "CONTACT_DATA_LAYER_NOT_READY");
        assert_eq!(
            response.body["message"],
            CONTACT_DATA_LAYER_NOT_READY_MESSAGE
        );
    }

    #[tokio::test]
    async fn current_user_profile_patch_persists_to_supabase() {
        let config = backend_config_with_contact_data();
        let outbound = RecordingOutboundClient::with_response(204, "");
        let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"display_name":"Ada","bio":null,"avatar_url":"https://cdn.example.test/avatar.png","ignored":"value"}"#,
                ),
                ..request_with_bearer(
                    "PATCH",
                    CURRENT_USER_PROFILE_PATH,
                    valid_app_session_token(),
                )
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body["message"], "Profile updated successfully");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, OutboundMethod::Patch);
        assert_eq!(
            calls[0].url,
            "https://project-ref.supabase.co/rest/v1/users?id=eq.app-session-user-1"
        );
        assert_eq!(recorded_header(&calls[0], "prefer"), Some("return=minimal"));
        assert_eq!(
            serde_json::from_str::<Value>(calls[0].body.as_deref().unwrap()).unwrap(),
            json!({
                "avatar_url": "https://cdn.example.test/avatar.png",
                "bio": null,
                "display_name": "Ada",
            })
        );
    }

    #[test]
    fn support_inquiry_requires_auth_before_parsing_body() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            request_with_body("POST", SUPPORT_INQUIRIES_PATH, "{}"),
        );

        assert_eq!(response.status, 401);
        assert_eq!(response.body["message"], "Unauthorized");
    }

    #[test]
    fn support_inquiry_requires_same_origin_for_cookie_auth() {
        let token = valid_app_session_token();
        let response = route_request(
            &backend_config_with_app_session_secret(),
            BackendRequest {
                body_text: Some(
                    r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
                ),
                cookie: Some(Box::leak(
                    format!("{APP_SESSION_COOKIE_NAME}={token}").into_boxed_str(),
                )),
                method: "POST",
                origin: Some("https://evil.example"),
                path: SUPPORT_INQUIRIES_PATH,
                url: Some("https://tanstack.tuturuuu.localhost/contact"),
                ..request("POST", SUPPORT_INQUIRIES_PATH)
            },
        );

        assert_eq!(response.status, 403);
        assert_eq!(
            response.body["message"],
            "Support inquiry creation requires same-origin confirmation"
        );
    }

    #[test]
    fn support_inquiry_validates_payload_after_auth() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            BackendRequest {
                body_text: Some(
                    r#"{"name":"J","email":"bad","type":"sales","product":"bad","subject":"Hi","message":"short"}"#,
                ),
                origin: Some("https://tanstack.tuturuuu.localhost"),
                ..request_with_cookie(
                    "POST",
                    SUPPORT_INQUIRIES_PATH,
                    format!("{APP_SESSION_COOKIE_NAME}={}", valid_app_session_token()),
                )
            },
        );

        assert_eq!(response.status, 400);
        assert_eq!(response.body["message"], "Invalid request body");
        assert!(
            response.body["errors"]
                .as_array()
                .is_some_and(|errors| errors.len() >= 6)
        );
    }

    #[test]
    fn support_inquiry_returns_data_layer_placeholder_for_valid_bearer_request() {
        let response = route_request(
            &backend_config_with_app_session_secret(),
            BackendRequest {
                body_text: Some(
                    r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
                ),
                ..request_with_bearer("POST", SUPPORT_INQUIRIES_PATH, valid_app_session_token())
            },
        );

        assert_eq!(response.status, 503);
        assert_eq!(response.body["code"], "CONTACT_DATA_LAYER_NOT_READY");
        assert_eq!(
            response.body["message"],
            CONTACT_DATA_LAYER_NOT_READY_MESSAGE
        );
    }

    #[tokio::test]
    async fn support_inquiry_async_handler_requires_contact_data_config() {
        let config = backend_config_with_app_session_secret();
        let outbound = RecordingOutboundClient::default();
        let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
                ),
                ..request_with_bearer("POST", SUPPORT_INQUIRIES_PATH, valid_app_session_token())
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 503);
        assert_eq!(response.body["code"], "CONTACT_DATA_LAYER_NOT_READY");
        assert_eq!(outbound.calls().len(), 0);
    }

    #[tokio::test]
    async fn support_inquiry_persists_to_supabase() {
        let config = backend_config_with_contact_data();
        let outbound =
            RecordingOutboundClient::with_response(201, r#"[{"id":"support-inquiry-123"}]"#);
        let response = handle_backend_request(
            &config,
            BackendRequest {
                body_text: Some(
                    r#"{"name":"Jane","email":"jane@example.com","type":"support","product":"web","subject":"Need help","message":"Please help me with this issue."}"#,
                ),
                ..request_with_bearer("POST", SUPPORT_INQUIRIES_PATH, valid_app_session_token())
            },
            &outbound,
        )
        .await;

        assert_eq!(response.status, 201);
        assert_eq!(response.body["success"], true);
        assert_eq!(response.body["inquiryId"], "support-inquiry-123");

        let calls = outbound.calls();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].method, OutboundMethod::Post);
        assert_eq!(
            calls[0].url,
            "https://project-ref.supabase.co/rest/v1/support_inquiries?select=id"
        );
        assert_eq!(
            recorded_header(&calls[0], "prefer"),
            Some("return=representation")
        );
        assert_eq!(
            serde_json::from_str::<Value>(calls[0].body.as_deref().unwrap()).unwrap(),
            json!({
                "creator_id": "app-session-user-1",
                "email": "jane@example.com",
                "message": "Please help me with this issue.",
                "name": "Jane",
                "product": "web",
                "subject": "Need help",
                "type": "support",
            })
        );
    }

    #[test]
    fn contact_api_routes_reject_unsupported_methods() {
        let profile_response = route_request(
            &BackendConfig::new("test", "backend"),
            request("POST", CURRENT_USER_PROFILE_PATH),
        );
        assert_eq!(profile_response.status, 405);
        assert_eq!(profile_response.allow, Some("GET, PATCH"));

        let inquiry_response = route_request(
            &BackendConfig::new("test", "backend"),
            request("GET", SUPPORT_INQUIRIES_PATH),
        );
        assert_eq!(inquiry_response.status, 405);
        assert_eq!(inquiry_response.allow, Some("POST"));
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
    fn obsolete_infrastructure_migration_routes_are_disabled_in_dev() {
        for (method, path) in [
            ("PUT", "/api/v1/infrastructure/migrate/score-names"),
            ("PUT", "/api/v1/infrastructure/migrate/classes"),
            ("PUT", "/api/v1/infrastructure/migrate/lessons"),
            ("PUT", "/api/v1/infrastructure/migrate/payment-methods"),
            ("GET", "/api/v1/infrastructure/migrate/class-scores"),
            ("PATCH", "/api/v1/infrastructure/migrate/workspace-users"),
            (
                "POST",
                "/api/v1/infrastructure/migrate/ensure-platform-users",
            ),
        ] {
            let response = route_request(
                &BackendConfig::new("development", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 410, "{method} {path}");
            assert_eq!(response.content_type, Some(APPLICATION_JSON));
            assert_eq!(response.body["error"], "MIGRATION_DISABLED");
            assert_eq!(
                response.body["message"],
                OBSOLETE_INFRASTRUCTURE_MIGRATION_DISABLED_MESSAGE
            );
        }
    }

    #[test]
    fn obsolete_infrastructure_migration_routes_require_dev_mode() {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request("PUT", "/api/v1/infrastructure/migrate/score-names"),
        );

        assert_eq!(response.status, 403);
        assert_eq!(response.body["error"], "Forbidden");
        assert_eq!(
            response.body["message"],
            "Infrastructure migration routes are only accessible in development mode"
        );
    }

    #[test]
    fn obsolete_infrastructure_migration_routes_preserve_legacy_allowed_methods() {
        for (method, path, allow) in [
            ("GET", "/api/v1/infrastructure/migrate/score-names", "PUT"),
            (
                "POST",
                "/api/v1/infrastructure/migrate/class-scores",
                "GET, PUT",
            ),
            (
                "DELETE",
                "/api/v1/infrastructure/migrate/workspace-users",
                "GET, PUT, PATCH",
            ),
            (
                "GET",
                "/api/v1/infrastructure/migrate/ensure-platform-users",
                "POST",
            ),
        ] {
            let response = route_request(
                &BackendConfig::new("development", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 405, "{method} {path}");
            assert_eq!(response.allow, Some(allow));
            assert_eq!(response.body["error"], "method not allowed");
        }
    }

    #[test]
    fn obsolete_workspace_migration_routes_are_disabled_in_dev() {
        for (method, path) in [
            ("PUT", "/api/workspaces/acme/products/categories/migrate"),
            ("PUT", "/api/workspaces/acme/products/units/migrate"),
            (
                "PUT",
                "/api/workspaces/acme/transactions/categories/migrate",
            ),
            ("PUT", "/api/workspaces/acme/users/indicators/migrate"),
            (
                "PUT",
                "/api/workspaces/acme/users/indicators/groups/migrate",
            ),
            ("PUT", "/api/workspaces/acme/wallets/migrate"),
            ("PUT", "/api/workspaces/acme/wallets/transactions/migrate"),
        ] {
            let response = route_request(
                &BackendConfig::new("development", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 410, "{method} {path}");
            assert_eq!(response.content_type, Some(APPLICATION_JSON));
            assert_eq!(response.body["error"], "MIGRATION_DISABLED");
            assert_eq!(
                response.body["message"],
                OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE
            );
        }
    }

    #[test]
    fn obsolete_workspace_migration_routes_require_dev_mode() {
        let response = route_request(
            &BackendConfig::new("production", "backend"),
            request("PUT", "/api/workspaces/acme/products/categories/migrate"),
        );

        assert_eq!(response.status, 403);
        assert_eq!(response.body["error"], "Forbidden");
        assert_eq!(
            response.body["message"],
            "Infrastructure migration routes are only accessible in development mode"
        );
    }

    #[test]
    fn obsolete_workspace_migration_routes_reject_unsupported_methods() {
        for (method, path, allow) in [
            (
                "GET",
                "/api/workspaces/acme/products/categories/migrate",
                "PUT",
            ),
            ("POST", "/api/workspaces/acme/wallets/migrate", "PUT"),
            (
                "DELETE",
                "/api/workspaces/acme/users/indicators/groups/migrate",
                "PUT",
            ),
        ] {
            let response = route_request(
                &BackendConfig::new("development", "backend"),
                request(method, path),
            );

            assert_eq!(response.status, 405, "{method} {path}");
            assert_eq!(response.allow, Some(allow));
            assert_eq!(response.body["error"], "method not allowed");
        }
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
    fn migration_status_reports_contact_data_layer_readiness() {
        let response = route_request(
            &backend_config_with_contact_data(),
            authorized_request("GET", "/api/migration/status"),
        );

        assert_eq!(response.status, 200);
        assert_eq!(response.body["contactData"]["configured"], true);
        assert_eq!(response.body["contactData"]["missing"], json!([]));
        assert_eq!(
            response.body["contactData"]["supabaseOrigin"],
            "https://project-ref.supabase.co"
        );
        assert!(
            !response
                .body
                .to_string()
                .contains("test-service-role-secret")
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
