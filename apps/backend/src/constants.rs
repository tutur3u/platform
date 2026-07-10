//! Crate-wide constants extracted from `lib.rs` (pure movement).

pub(crate) const APPLICATION_JSON: &str = "application/json";
pub(crate) const JSON_SECURITY_HEADERS: [(&str, &str); 4] = [
    (
        "content-security-policy",
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    ),
    ("referrer-policy", "no-referrer"),
    ("x-content-type-options", "nosniff"),
    ("x-frame-options", "DENY"),
];
pub(crate) const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024;
pub(crate) const TOP_LEGACY_ROUTE_LIMIT: usize = 20;
pub(crate) const WELL_KNOWN_CACHE_CONTROL: &str = "public, max-age=300, must-revalidate";
pub(crate) const SERWIST_SERVICE_WORKER_PATH: &str = "/serwist/sw.js";
pub(crate) const SERWIST_SOURCE_MAP_PATH: &str = "/serwist/sw.js.map";
pub(crate) const SERWIST_DECOMMISSION_WORKER: &str = r#"self.addEventListener('install', (event) => {
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
pub(crate) const SERWIST_DECOMMISSION_SOURCE_MAP: &str = r#"{"version":3,"file":"sw.js","sources":["serwist-decommission-worker.js"],"names":[],"mappings":""}"#;
pub(crate) const BROWSER_STATE_RECOVERY_PATH: &str = "/~recover-browser-state";
pub(crate) const BROWSER_STATE_RECOVERY_HTML: &str = r#"<!doctype html>
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
pub(crate) const BROWSER_STATE_RECOVERY_CLEAR_SITE_DATA: &str =
    r#""cache", "cookies", "storage", "executionContexts""#;
pub(crate) const NO_STORE_CACHE_CONTROL: &str = "no-store, no-cache, must-revalidate";
pub(crate) const NO_STORE_CDN_CACHE_CONTROL: &str = "no-store";
pub(crate) const LOCALE_COOKIE_NAME: &str = "NEXT_LOCALE";
pub(crate) const SIDEBAR_COLLAPSED_COOKIE_NAME: &str = "sidebar-collapsed";
pub(crate) const SIDEBAR_SIZE_COOKIE_NAME: &str = "sidebar-size";
pub(crate) const MAIN_CONTENT_SIZE_COOKIE_NAME: &str = "main-content-size";
pub(crate) const SUPPORTED_LOCALES: [&str; 2] = ["en", "vi"];
pub(crate) const COOKIE_DELETE_VALUE: &str =
    "; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
pub(crate) const GROUPED_SCORE_NAMES_MIGRATION_PATH: &str =
    "/api/v1/infrastructure/migrate/grouped-score-names";
pub(crate) const GROUPED_SCORE_NAMES_MIGRATION_DISABLED_MESSAGE: &str = "Grouped score names migration is no longer available. The user_group_indicators table was removed in a recent database migration.";
pub(crate) const OBSOLETE_INFRASTRUCTURE_MIGRATION_DISABLED_MESSAGE: &str = "This infrastructure batch migration endpoint is no longer available. Use maintained database migrations or local backfill scripts instead.";
pub(crate) const OBSOLETE_WORKSPACE_MIGRATION_DISABLED_MESSAGE: &str = "This workspace migration endpoint is no longer available. Use maintained database migrations or local backfill scripts instead.";
pub(crate) const RETIRED_WORKSPACE_ENCRYPTION_MIGRATION_DISABLED_MESSAGE: &str = "Workspace encryption event migration is no longer available. Use maintained E2EE rollout tooling or local backfill scripts instead.";
pub(crate) const RETIRED_WORKSPACE_STORAGE_MIGRATION_DISABLED_MESSAGE: &str = "Workspace storage provider migration is no longer available. Use maintained storage migration runbooks or local backfill scripts instead.";
pub(crate) const RETIRED_WORKSPACE_EXPORT_MIGRATION_DISABLED_MESSAGE: &str = "Workspace API-key migration export is no longer available. Use maintained database exports or local backfill scripts instead.";
pub(crate) const OBSOLETE_INFRASTRUCTURE_MIGRATION_POST_ONLY: [&str; 1] = ["ensure-platform-users"];
pub(crate) const OBSOLETE_INFRASTRUCTURE_MIGRATION_GET_PUT_PATCH: [&str; 3] = [
    "wallet-transactions",
    "workspace-settings",
    "workspace-users",
];
pub(crate) const OBSOLETE_INFRASTRUCTURE_MIGRATION_GET_PUT: [&str; 37] = [
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
pub(crate) const OBSOLETE_INFRASTRUCTURE_MIGRATION_PUT_ONLY: [&str; 25] = [
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
pub(crate) const USER_FIELD_TYPES_PATH: &str = "/api/v1/infrastructure/users/fields/types";
pub(crate) const AUTH_CORS_PREFLIGHT_PATHS: [&str; 8] = [
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
pub(crate) const WEBGL_PACKAGE_UPLOAD_CORS_STATIC_ORIGINS: [&str; 2] =
    ["https://cms.tuturuuu.com", "http://localhost:7811"];
pub(crate) const WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_METHODS: &str = "PUT, OPTIONS";
pub(crate) const WEBGL_PACKAGE_UPLOAD_CORS_ALLOW_HEADERS: &str = "Authorization, Content-Type";
pub(crate) const BARE_AUTH_PREFLIGHT_PATHS: [&str; 3] = [
    "/api/v1/auth/qr-login/challenges",
    "/api/v1/auth/mfa/mobile/challenges",
    "/api/v1/auth/mfa/mobile/approvals",
];
pub(crate) const DISABLED_GROUP_CHECK_EMAIL_MESSAGE: &str = "Direct post email sending has been removed. Emails are now sent by the system queue after approval.";
pub(crate) const DISCORD_DAILY_REPORT_CRON_PATH: &str = "/api/cron/discord/daily-report";
pub(crate) const DISCORD_DAILY_REPORT_UPSTREAM_PATH: &str = "/daily-report";
pub(crate) const DISCORD_WOL_DAILY_REMIND_CRON_PATH: &str = "/api/cron/discord/wol/daily/remind";
pub(crate) const DISCORD_WOL_DAILY_REMIND_UPSTREAM_PATH: &str = "/wol-reminder";
pub(crate) const MISSING_CRON_SECRET_MESSAGE: &str = "CRON_SECRET or VERCEL_CRON_SECRET is not set";
pub(crate) const MISSING_DISCORD_APP_DEPLOYMENT_URL_MESSAGE: &str =
    "DISCORD_APP_DEPLOYMENT_URL is not set";
pub(crate) const INVALID_DISCORD_JSON_MESSAGE: &str = "Invalid JSON from Discord app";
pub(crate) const DISCORD_APP_REQUEST_FAILED_MESSAGE: &str = "Discord app request failed";
pub(crate) const RETIRED_LEGACY_API_ERROR: &str = "ENDPOINT_REMOVED";
pub(crate) const RETIRED_SHARE_COURSE_MESSAGE: &str =
    "This legacy shared course API has been removed. Use GET /api/v1/course?courseId=... instead.";
pub(crate) const RETIRED_SYNC_LOGS_MESSAGE: &str = "This legacy all-workspace sync logs API has been removed. Use workspace-scoped calendar sync monitoring instead.";
pub(crate) const RETIRED_USER_SEARCH_MESSAGE: &str = "This legacy user search API has been removed. Use a maintained server-owned people search API instead.";
pub(crate) const RETIRED_TUTURUUU_PROXY_MESSAGE: &str = "This legacy development Tuturuuu API proxy has been removed. Use maintained internal API clients or direct backend routes instead.";
#[cfg(feature = "native")]
pub(crate) const TRUTHY_ENV_VALUES: [&str; 4] = ["1", "true", "yes", "on"];
#[cfg(feature = "native")]
pub(crate) const SAFE_LOCAL_WEB_ORIGINS: [&str; 8] = [
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
pub(crate) const SAFE_LOCAL_SUPABASE_ORIGINS: [&str; 3] = [
    "http://127.0.0.1:8001",
    "http://host.docker.internal:8001",
    "http://localhost:8001",
];
#[cfg(feature = "native")]
pub(crate) const LOCAL_E2E_WEB_URL_KEYS: [&str; 5] = [
    "BASE_URL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_WEB_APP_URL",
    "PORTLESS_URL",
    "WEB_APP_URL",
];
#[cfg(feature = "native")]
pub(crate) const LOCAL_E2E_SUPABASE_URL_KEYS: [&str; 4] = [
    "DOCKER_INTERNAL_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVER_URL",
    "SUPABASE_URL",
];
#[cfg(feature = "native")]
pub(crate) const SUPABASE_REFERENCE_KEYS: [&str; 7] = [
    "DATABASE_URL",
    "DIRECT_URL",
    "DOCKER_INTERNAL_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "POSTGRES_URL",
    "SUPABASE_SERVER_URL",
    "SUPABASE_URL",
];
