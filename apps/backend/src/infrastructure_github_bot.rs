//! Handler for `GET /api/v1/infrastructure/github-bot`.
//!
//! Legacy source: `apps/web/src/app/api/v1/infrastructure/github-bot/route.ts`
//! plus `apps/web/src/lib/infrastructure/github-bot-access.ts`,
//! `apps/web/src/lib/infrastructure/github-bot/state.ts`,
//! `apps/web/src/lib/infrastructure/github-bot/shared.ts`, and
//! `apps/web/src/lib/infrastructure/github-bot/sanitize.ts`.
//!
//! Only the GET method is migrated here. The legacy route also defines a PUT
//! mutation (`saveGitHubBotConfiguration`) that is intentionally NOT handled:
//! this handler returns `None` for every non-GET method so the Cloudflare
//! worker falls through to the still-active Next.js route for those mutations.
//!
//! Legacy GET behavior reproduced:
//! 1. `authorizeGitHubBotAdmin(request)`:
//!    - Authenticates the Supabase user; if none -> 401 `{ message: "Unauthorized" }`.
//!    - Resolves the caller's effective permissions in the ROOT workspace
//!      (mirroring `getPermissions({ request, wsId: ROOT_WORKSPACE_ID })`). If
//!      the permission set does not contain `manage_workspace_secrets`
//!      (or `getPermissions` would have returned null) -> 403
//!      `{ message: "Forbidden" }`.
//! 2. `listGitHubBotState(db)` reads the `private` schema:
//!    - `github_bot_configurations` where `id = 'tuturuuu-ci'` (maybeSingle).
//!      When absent -> `{ auditEvents: [], clients: [], configuration: null }`.
//!    - Otherwise, `github_bot_watcher_clients` (configuration_id =
//!      'tuturuuu-ci', order created_at desc, limit 50) and
//!      `github_bot_audit_events` (select actor_type,created_at,event_type,id,
//!      metadata; configuration_id = 'tuturuuu-ci'; order created_at desc;
//!      limit 50), mapped to the camelCase status shapes.
//!    - Any read failure surfaces as a `GitHubBotStoreError(message, 500)` whose
//!      `code` defaults to `github_bot_error`. The route's `errorResponse`
//!      renders that as `{ code: "github_bot_error", message: <fallback> }`
//!      with status 500 (fallback message:
//!      "Failed to load GitHub bot configuration").
//!
//! NOTES / ASSUMPTIONS the integrator must verify:
//! - The legacy handler uses the admin (service-role) Supabase client and reads
//!   the `private` schema. PostgREST exposes non-public schemas via the
//!   `Accept-Profile` request header, so every private read here sends
//!   `Accept-Profile: private` (mirroring `workspaces_wallets_walletid.rs`).
//!   The `private` schema must be exposed in PostgREST's `db-schemas` config
//!   for this to work; if it is not, these reads would 404/406 and surface as a
//!   500, matching the legacy `assertNoError` failure shape.
//! - The permission-resolution helpers below are a file-local copy of the
//!   `getPermissions` composition in `workspaces_secrets.rs` (private fns that
//!   cannot be imported), restricted to the ROOT workspace only, since the
//!   legacy access helper checks only `wsId: ROOT_WORKSPACE_ID`.
//! - `sanitizeAuditMetadata` is ported by hand (no `regex` crate is available in
//!   this crate). The port reproduces the redaction intent: JWTs, bearer
//!   tokens, sensitive `key: value` pairs, sensitive query params, emails,
//!   local paths, URLs, and known hostnames are redacted; whitespace is
//!   collapsed; strings are truncated to 200 chars (keys to 80); objects and
//!   arrays are capped at 20 entries. Because the legacy implementation relies
//!   on JS regex semantics, exact byte-for-byte equivalence on adversarial
//!   inputs is NOT guaranteed -- this is the lowest-confidence part of the port
//!   and should be validated against representative audit metadata.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const GITHUB_BOT_PATH: &str = "/api/v1/infrastructure/github-bot";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const ADMIN_PERMISSION: &str = "admin";
const MANAGE_WORKSPACE_SECRETS: &str = "manage_workspace_secrets";

const PRIVATE_SCHEMA: &str = "private";

const GITHUB_BOT_CONFIG_ID: &str = "tuturuuu-ci";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const LOAD_FAILED_MESSAGE: &str = "Failed to load GitHub bot configuration";
const STORE_ERROR_CODE: &str = "github_bot_error";

// `GITHUB_BOT_REQUIRED_PERMISSIONS = { checks: 'write' }` is emitted as a JSON
// object literal in `map_config`.

// ---------------------------------------------------------------------------
// Row models
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GitHubBotConfigRow {
    app_id: Option<String>,
    enabled: Option<bool>,
    installation_id: Option<String>,
    last_validated_at: Option<String>,
    last_validation_error: Option<String>,
    private_key_encrypted: Option<String>,
    private_key_fingerprint: Option<String>,
    repository_name: Option<String>,
    repository_owner: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct GitHubBotWatcherClientRow {
    created_at: Option<String>,
    expires_at: Option<String>,
    id: Option<String>,
    last_four: Option<String>,
    last_issued_at: Option<String>,
    last_used_at: Option<String>,
    name: Option<String>,
    revoked_at: Option<String>,
    token_prefix: Option<String>,
}

#[derive(Deserialize)]
struct GitHubBotAuditEventRow {
    actor_type: Option<String>,
    created_at: Option<String>,
    event_type: Option<String>,
    id: Option<String>,
    #[serde(default)]
    metadata: Value,
}

#[derive(Deserialize)]
struct MembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceCreatorRow {
    creator_id: Option<String>,
}

#[derive(Deserialize)]
struct PermissionRow {
    permission: Option<String>,
}

#[derive(Deserialize)]
struct RoleMemberRow {
    #[serde(default)]
    workspace_roles: Vec<RoleRow>,
}

#[derive(Deserialize)]
struct RoleRow {
    #[serde(default)]
    workspace_role_permissions: Vec<PermissionRow>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_github_bot_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != GITHUB_BOT_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => github_bot_response(config, request, outbound).await,
        // Only GET is migrated. Return None for every other method (e.g. PUT) so
        // the worker falls through to the still-active Next.js route.
        _ => return None,
    })
}

async fn github_bot_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return store_error_response(LOAD_FAILED_MESSAGE);
    }

    // --- authorizeGitHubBotAdmin: authenticate -----------------------------
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // --- authorizeGitHubBotAdmin: ROOT manage_workspace_secrets ------------
    //
    // `getPermissions({ request, wsId: ROOT_WORKSPACE_ID })`. A resolution
    // failure yields null permissions -> treated as "no permission" -> 403,
    // matching the legacy `!permissions || withoutPermission(...)` branch.
    let root_permissions =
        match effective_workspace_permissions(contact_data, outbound, ROOT_WORKSPACE_ID, &user_id)
            .await
        {
            Ok(permissions) => permissions,
            Err(()) => WorkspaceAccess::none(),
        };

    if !root_permissions.contains(MANAGE_WORKSPACE_SECRETS) {
        return message_response(403, FORBIDDEN_MESSAGE);
    }

    // --- listGitHubBotState ------------------------------------------------
    match list_github_bot_state(contact_data, outbound).await {
        Ok(state) => no_store_response(json_response(200, state)),
        Err(()) => store_error_response(LOAD_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// listGitHubBotState (private schema)
// ---------------------------------------------------------------------------

async fn list_github_bot_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    let Some(configuration) = load_configuration(contact_data, outbound).await? else {
        return Ok(json!({
            "auditEvents": [],
            "clients": [],
            "configuration": Value::Null,
        }));
    };

    let clients = load_watcher_clients(contact_data, outbound).await?;
    let audit_events = load_audit_events(contact_data, outbound).await?;

    Ok(json!({
        "auditEvents": audit_events,
        "clients": clients,
        "configuration": map_config(&configuration),
    }))
}

async fn load_configuration(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<GitHubBotConfigRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "github_bot_configurations",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{GITHUB_BOT_CONFIG_ID}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<GitHubBotConfigRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn load_watcher_clients(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "github_bot_watcher_clients",
        &[
            ("select", "*".to_owned()),
            ("configuration_id", format!("eq.{GITHUB_BOT_CONFIG_ID}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "50".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<GitHubBotWatcherClientRow>>()
        .map_err(|_| ())?
        .iter()
        .map(map_client)
        .collect())
}

async fn load_audit_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "github_bot_audit_events",
        &[
            (
                "select",
                "actor_type,created_at,event_type,id,metadata".to_owned(),
            ),
            ("configuration_id", format!("eq.{GITHUB_BOT_CONFIG_ID}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "50".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = private_service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<GitHubBotAuditEventRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(map_audit_event)
        .collect())
}

// ---------------------------------------------------------------------------
// Row mapping (camelCase status shapes)
// ---------------------------------------------------------------------------

fn map_config(row: &GitHubBotConfigRow) -> Value {
    json!({
        "appId": row.app_id,
        "enabled": row.enabled.unwrap_or(false),
        "installationId": row.installation_id,
        "lastValidatedAt": row.last_validated_at,
        "lastValidationError": row.last_validation_error,
        "permissions": { "checks": "write" },
        "privateKeyConfigured": row
            .private_key_encrypted
            .as_deref()
            .is_some_and(|value| !value.is_empty()),
        "privateKeyFingerprint": row.private_key_fingerprint,
        "repository": {
            "name": row.repository_name,
            "owner": row.repository_owner,
        },
        "updatedAt": row.updated_at,
    })
}

fn map_client(row: &GitHubBotWatcherClientRow) -> Value {
    json!({
        "createdAt": row.created_at,
        "expiresAt": row.expires_at,
        "id": row.id,
        "lastFour": row.last_four,
        "lastIssuedAt": row.last_issued_at,
        "lastUsedAt": row.last_used_at,
        "name": row.name,
        "prefix": row.token_prefix,
        "revokedAt": row.revoked_at,
    })
}

fn map_audit_event(row: GitHubBotAuditEventRow) -> Value {
    let metadata = if row.metadata.is_null() {
        Value::Object(Map::new())
    } else {
        row.metadata
    };

    json!({
        "actorType": row.actor_type,
        "createdAt": row.created_at,
        "eventType": row.event_type,
        "id": row.id,
        "metadata": sanitize_audit_metadata(&metadata),
    })
}

// ---------------------------------------------------------------------------
// sanitizeAuditMetadata (hand-port; no regex crate available)
// ---------------------------------------------------------------------------

const REDACTED_VALUE: &str = "[REDACTED]";
const REDACTED_EMAIL: &str = "[REDACTED_EMAIL]";
const REDACTED_PATH: &str = "[REDACTED_PATH]";
const REDACTED_URL: &str = "[REDACTED_URL]";

const SENSITIVE_KEY_TOKENS: &[&str] = &[
    "access_token",
    "access-token",
    "accesstoken",
    "api_key",
    "api-key",
    "apikey",
    "authorization",
    "client_secret",
    "client-secret",
    "clientsecret",
    "cookie",
    "password",
    "refresh_token",
    "refresh-token",
    "refreshtoken",
    "secret",
    "session",
    "token",
];

const SENSITIVE_HOSTNAME_TLDS: &[&str] = &[
    "com",
    "dev",
    "internal",
    "io",
    "local",
    "localhost",
    "net",
    "org",
    "test",
];

/// Top-level entry: `sanitizeAuditMetadata(metadata)` -> object of sanitized
/// values (capped at 20 entries; keys sanitized with maxLength 80).
fn sanitize_audit_metadata(metadata: &Value) -> Value {
    // Legacy `sanitizeAuditMetadata` casts the input to a record and runs the
    // recursive value sanitizer; in practice `metadata` is always an object.
    sanitize_value(metadata)
}

fn sanitize_value(value: &Value) -> Value {
    match value {
        Value::Null => Value::Null,
        Value::String(text) => Value::String(sanitize_public_text(text, 200).unwrap_or_default()),
        Value::Number(number) => {
            if number.as_f64().map(f64::is_finite).unwrap_or(false) {
                value.clone()
            } else {
                Value::String(number.to_string())
            }
        }
        Value::Bool(flag) => Value::Bool(*flag),
        Value::Array(items) => Value::Array(
            items
                .iter()
                .take(20)
                .map(sanitize_value)
                .collect::<Vec<_>>(),
        ),
        Value::Object(map) => {
            let mut out = Map::new();
            for (key, entry) in map.iter().take(20) {
                let sanitized_key =
                    sanitize_public_text(key, 80).unwrap_or_else(|| "field".to_owned());
                out.insert(sanitized_key, sanitize_value(entry));
            }
            Value::Object(out)
        }
    }
}

/// Port of `sanitizeGitHubBotPublicText`. Returns `None` when the sanitized
/// result is empty (legacy returns `null`); callers coerce `None` to "".
fn sanitize_public_text(value: &str, max_length: usize) -> Option<String> {
    let mut text = value.to_owned();

    text = redact_sensitive_query_params(&text);
    text = redact_sensitive_key_values(&text);
    text = redact_bearer_tokens(&text);
    text = redact_jwts(&text);
    text = redact_emails(&text);
    text = redact_local_paths(&text);
    text = redact_urls(&text);
    text = redact_hostnames(&text);
    text = collapse_whitespace(&text);

    let trimmed = text.trim().to_owned();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.chars().count() > max_length {
        let keep = max_length.saturating_sub(3);
        let prefix: String = trimmed.chars().take(keep).collect();
        Some(format!("{prefix}..."))
    } else {
        Some(trimmed)
    }
}

fn collapse_whitespace(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_ws = false;
    for ch in value.chars() {
        if ch.is_whitespace() {
            if !in_ws {
                out.push(' ');
                in_ws = true;
            }
        } else {
            out.push(ch);
            in_ws = false;
        }
    }
    out
}

/// `([?&]key=)value` -> `([?&]key=)[REDACTED]` for sensitive query params,
/// stopping the value at the next `&` or whitespace.
fn redact_sensitive_query_params(value: &str) -> String {
    let bytes: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < bytes.len() {
        let ch = bytes[i];
        if ch == '?' || ch == '&' {
            // Try to match `<delim>key=`.
            if let Some((key_len, _matched_key)) = match_sensitive_query_key(&bytes[i + 1..]) {
                let after_key = i + 1 + key_len;
                if after_key < bytes.len() && bytes[after_key] == '=' {
                    out.push(ch);
                    for character in bytes.iter().take(after_key).skip(i + 1) {
                        out.push(*character);
                    }
                    out.push('=');
                    out.push_str(REDACTED_VALUE);
                    // Skip the original value until `&` or whitespace.
                    let mut j = after_key + 1;
                    while j < bytes.len() && bytes[j] != '&' && !bytes[j].is_whitespace() {
                        j += 1;
                    }
                    i = j;
                    continue;
                }
            }
        }
        out.push(ch);
        i += 1;
    }
    out
}

/// Matches a sensitive query-param key (case-insensitive) at the start of the
/// slice, returning its char length when followed by `=`.
fn match_sensitive_query_key(rest: &[char]) -> Option<(usize, &'static str)> {
    for token in SENSITIVE_KEY_TOKENS {
        let token_chars: Vec<char> = token.chars().collect();
        if rest.len() >= token_chars.len()
            && rest[..token_chars.len()]
                .iter()
                .zip(token_chars.iter())
                .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            return Some((token_chars.len(), token));
        }
    }
    None
}

/// `key: value` / `key=value` -> `key: [REDACTED]` for sensitive keys, where the
/// key stands as a whole word and the value is a quoted string, a Bearer token,
/// or a run of non-delimiter chars.
fn redact_sensitive_key_values(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i)
            && let Some((token, key_len)) = match_sensitive_word(&chars, i)
        {
            // Skip optional whitespace, then require `:` or `=`.
            let mut ws = i + key_len;
            while ws < chars.len() && chars[ws].is_whitespace() {
                ws += 1;
            }
            if ws < chars.len() && (chars[ws] == ':' || chars[ws] == '=') {
                // Skip whitespace after the separator.
                let mut v = ws + 1;
                while v < chars.len() && chars[v].is_whitespace() {
                    v += 1;
                }
                let value_end = consume_key_value(&chars, v);
                if value_end > v {
                    out.push_str(token);
                    out.push_str(": ");
                    out.push_str(REDACTED_VALUE);
                    i = value_end;
                    continue;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_word_boundary(chars: &[char], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    let prev = chars[i - 1];
    !(prev.is_ascii_alphanumeric() || prev == '_')
}

/// Matches a sensitive word at position `i` ending on a word boundary.
fn match_sensitive_word(chars: &[char], i: usize) -> Option<(&'static str, usize)> {
    // Note: legacy pattern excludes `apikey`/`session` "as word" differently;
    // it uses the same token list as query params except `api_key`/`apikey`
    // variants are matched as words too. We match the shared token list.
    for token in SENSITIVE_KEY_VALUE_TOKENS {
        let token_chars: Vec<char> = token.chars().collect();
        let end = i + token_chars.len();
        if chars.len() >= end
            && chars[i..end]
                .iter()
                .zip(token_chars.iter())
                .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            // Require a trailing word boundary (next char not alnum/_).
            let boundary =
                end >= chars.len() || !(chars[end].is_ascii_alphanumeric() || chars[end] == '_');
            if boundary {
                return Some((token, token_chars.len()));
            }
        }
    }
    None
}

const SENSITIVE_KEY_VALUE_TOKENS: &[&str] = &[
    "access_token",
    "access-token",
    "accesstoken",
    "api_key",
    "api-key",
    "apikey",
    "authorization",
    "client_secret",
    "client-secret",
    "clientsecret",
    "cookie",
    "password",
    "refresh_token",
    "refresh-token",
    "refreshtoken",
    "secret",
    "session",
    "token",
];

/// Consume a key-value: quoted string (`"..."` or `'...'`), a Bearer token, or a
/// run of non-`,;}]` whitespace-free characters.
fn consume_key_value(chars: &[char], start: usize) -> usize {
    if start >= chars.len() {
        return start;
    }
    let first = chars[start];
    if first == '"' || first == '\'' {
        let mut j = start + 1;
        while j < chars.len() && chars[j] != first {
            j += 1;
        }
        if j < chars.len() {
            j += 1; // include closing quote
        }
        return j;
    }
    // Bearer <token>
    if matches_ci(chars, start, "bearer") {
        let mut j = start + 6;
        while j < chars.len() && chars[j].is_whitespace() {
            j += 1;
        }
        while j < chars.len() && is_token_char(chars[j]) {
            j += 1;
        }
        return j;
    }
    // [^\s,;}\]]+
    let mut j = start;
    while j < chars.len() {
        let c = chars[j];
        if c.is_whitespace() || c == ',' || c == ';' || c == '}' || c == ']' {
            break;
        }
        j += 1;
    }
    j
}

fn matches_ci(chars: &[char], start: usize, needle: &str) -> bool {
    let needle_chars: Vec<char> = needle.chars().collect();
    let end = start + needle_chars.len();
    chars.len() >= end
        && chars[start..end]
            .iter()
            .zip(needle_chars.iter())
            .all(|(a, b)| a.eq_ignore_ascii_case(b))
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '~' | '+' | '/' | '=' | '-')
}

/// `\bBearer\s+<token>` -> `Bearer [REDACTED]`.
fn redact_bearer_tokens(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i) && matches_ci(&chars, i, "bearer") {
            let after = i + 6;
            // Require at least one whitespace then a token.
            let mut j = after;
            let mut ws_count = 0;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
                ws_count += 1;
            }
            if ws_count >= 1 && j < chars.len() && is_token_char(chars[j]) {
                while j < chars.len() && is_token_char(chars[j]) {
                    j += 1;
                }
                out.push_str("Bearer ");
                out.push_str(REDACTED_VALUE);
                i = j;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// `\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b` -> `[REDACTED]`.
fn redact_jwts(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i)
            && matches_exact(&chars, i, "eyJ")
            && let Some(end) = match_jwt(&chars, i)
        {
            out.push_str(REDACTED_VALUE);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn matches_exact(chars: &[char], start: usize, needle: &str) -> bool {
    let needle_chars: Vec<char> = needle.chars().collect();
    let end = start + needle_chars.len();
    chars.len() >= end && chars[start..end] == needle_chars[..]
}

fn is_jwt_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// Match a JWT starting at `i` (already known to begin with `eyJ`). Three
/// dot-separated runs of jwt chars; returns the end index past the token.
fn match_jwt(chars: &[char], start: usize) -> Option<usize> {
    // First segment: eyJ + jwt chars.
    let mut j = start + 3;
    while j < chars.len() && is_jwt_char(chars[j]) {
        j += 1;
    }
    if j >= chars.len() || chars[j] != '.' {
        return None;
    }
    j += 1;
    let seg2_start = j;
    while j < chars.len() && is_jwt_char(chars[j]) {
        j += 1;
    }
    if j == seg2_start || j >= chars.len() || chars[j] != '.' {
        return None;
    }
    j += 1;
    let seg3_start = j;
    while j < chars.len() && is_jwt_char(chars[j]) {
        j += 1;
    }
    if j == seg3_start {
        return None;
    }
    // Trailing word boundary.
    if j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '_') {
        return None;
    }
    Some(j)
}

/// Email pattern -> `[REDACTED_EMAIL]`.
fn redact_emails(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_word_boundary(&chars, i)
            && let Some(end) = match_email(&chars, i)
        {
            out.push_str(REDACTED_EMAIL);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_email_local(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '%' | '+' | '-')
}

fn is_email_domain(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '.' || c == '-'
}

/// `[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}` (case-insensitive).
fn match_email(chars: &[char], start: usize) -> Option<usize> {
    let mut j = start;
    while j < chars.len() && is_email_local(chars[j]) {
        j += 1;
    }
    if j == start || j >= chars.len() || chars[j] != '@' {
        return None;
    }
    j += 1;
    let domain_start = j;
    while j < chars.len() && is_email_domain(chars[j]) {
        j += 1;
    }
    if j == domain_start {
        return None;
    }
    // Require a final `.<tld>` of >= 2 ascii letters within the matched domain.
    // Find the last dot inside [domain_start, j).
    let domain: Vec<char> = chars[domain_start..j].to_vec();
    let last_dot = domain.iter().rposition(|c| *c == '.')?;
    let tld = &domain[last_dot + 1..];
    if tld.len() < 2 || !tld.iter().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    Some(j)
}

/// Local-path pattern -> `[REDACTED_PATH]` (`/Users/...`, `/home/...`,
/// `/private/...`, or `X:\...`), stopping at whitespace or `)`.
fn redact_local_paths(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if let Some(end) = match_local_path(&chars, i) {
            out.push_str(REDACTED_PATH);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn match_local_path(chars: &[char], start: usize) -> Option<usize> {
    let unix_prefixes = ["/Users/", "/home/", "/private/"];
    for prefix in unix_prefixes {
        if matches_exact(chars, start, prefix) {
            let mut j = start + prefix.chars().count();
            while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ')' {
                j += 1;
            }
            return Some(j);
        }
    }
    // Windows: `[A-Za-z]:\`
    if start + 2 < chars.len()
        && chars[start].is_ascii_alphabetic()
        && chars[start + 1] == ':'
        && chars[start + 2] == '\\'
    {
        let mut j = start + 3;
        while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ')' {
            j += 1;
        }
        return Some(j);
    }
    None
}

/// `https?://...` -> `[REDACTED_URL]`, stopping at whitespace or `)`.
fn redact_urls(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if matches_ci(&chars, i, "http://") || matches_ci(&chars, i, "https://") {
            let mut j = i;
            while j < chars.len() && !chars[j].is_whitespace() && chars[j] != ')' {
                j += 1;
            }
            out.push_str(REDACTED_URL);
            i = j;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// Hostname pattern: `(label\.)+TLD` for known TLDs -> `[REDACTED_URL]`.
fn redact_hostnames(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len());
    let mut i = 0;
    while i < chars.len() {
        if is_hostname_boundary(&chars, i)
            && let Some(end) = match_hostname(&chars, i)
        {
            out.push_str(REDACTED_URL);
            i = end;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

fn is_hostname_label_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-'
}

fn is_hostname_boundary(chars: &[char], i: usize) -> bool {
    if i == 0 {
        return true;
    }
    // `\b` before an alnum: previous char must be a non-word char.
    let prev = chars[i - 1];
    !(prev.is_ascii_alphanumeric() || prev == '_')
}

/// `(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:TLD)\b` (case-insensitive).
fn match_hostname(chars: &[char], start: usize) -> Option<usize> {
    let mut j = start;
    let mut had_label = false;

    loop {
        // One DNS label followed by a dot.
        let label_start = j;
        if j >= chars.len() || !chars[j].is_ascii_alphanumeric() {
            break;
        }
        while j < chars.len() && is_hostname_label_char(chars[j]) {
            j += 1;
        }
        // Label must end with an alnum (regex requires trailing [a-z0-9]).
        if chars[j - 1] == '-' {
            return None;
        }
        if j >= chars.len() || chars[j] != '.' {
            // No dot after this label; the previous labels (if any) plus a TLD
            // pattern must have matched. Reset to consider this run as the TLD.
            j = label_start;
            break;
        }
        j += 1; // consume '.'
        had_label = true;
    }

    if !had_label {
        return None;
    }

    // Now match the TLD at `j`.
    for tld in SENSITIVE_HOSTNAME_TLDS {
        if matches_ci(chars, j, tld) {
            let end = j + tld.chars().count();
            // Trailing `\b`: next char must not be a word char.
            let boundary =
                end >= chars.len() || !(chars[end].is_ascii_alphanumeric() || chars[end] == '_');
            if boundary {
                return Some(end);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Permissions (mirrors getPermissions composition; ROOT workspace only)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct WorkspaceAccess {
    all: bool,
    permissions: Vec<String>,
}

impl WorkspaceAccess {
    fn none() -> Self {
        Self {
            all: false,
            permissions: Vec::new(),
        }
    }

    fn all() -> Self {
        Self {
            all: true,
            permissions: Vec::new(),
        }
    }

    fn from_permissions(permissions: Vec<String>) -> Self {
        let all = permissions
            .iter()
            .any(|permission| permission == ADMIN_PERMISSION);
        Self { all, permissions }
    }

    fn contains(&self, permission: &str) -> bool {
        self.all || self.permissions.iter().any(|value| value == permission)
    }
}

async fn effective_workspace_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<WorkspaceAccess, ()> {
    let Some(membership_type) =
        workspace_membership_type(contact_data, outbound, workspace_id, user_id).await?
    else {
        return Ok(WorkspaceAccess::none());
    };

    let Some(creator_id) = workspace_creator_id(contact_data, outbound, workspace_id).await? else {
        return Ok(WorkspaceAccess::none());
    };
    let is_creator = membership_type == "MEMBER" && creator_id == user_id;
    if is_creator {
        return Ok(WorkspaceAccess::all());
    }

    let mut permissions = Vec::new();
    if membership_type == "MEMBER" {
        permissions.extend(role_permissions(contact_data, outbound, workspace_id, user_id).await?);
    }
    permissions
        .extend(default_permissions(contact_data, outbound, workspace_id, &membership_type).await?);

    Ok(WorkspaceAccess::from_permissions(permissions))
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<MembershipRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.membership_type))
}

async fn workspace_creator_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "creator_id".to_owned()),
            ("id", format!("eq.{workspace_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<WorkspaceCreatorRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.creator_id))
}

async fn role_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_role_members",
        &[
            (
                "select",
                "workspace_roles!inner(workspace_role_permissions(permission))".to_owned(),
            ),
            ("user_id", format!("eq.{user_id}")),
            ("workspace_roles.ws_id", format!("eq.{workspace_id}")),
            (
                "workspace_roles.workspace_role_permissions.enabled",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<RoleMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .flat_map(|member| member.workspace_roles)
        .flat_map(|role| role.workspace_role_permissions)
        .filter_map(|permission| permission.permission)
        .collect())
}

async fn default_permissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    workspace_id: &str,
    member_type: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_default_permissions",
        &[
            ("select", "permission".to_owned()),
            ("ws_id", format!("eq.{workspace_id}")),
            ("member_type", format!("eq.{member_type}")),
            ("enabled", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    if !is_success(response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.permission)
        .collect())
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

/// Service-role GET against the `private` PostgREST schema (via `Accept-Profile`).
async fn private_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Accept-Profile", PRIVATE_SCHEMA),
        )
        .await
        .map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Mirrors `errorResponse` for a `GitHubBotStoreError(message, 500)` whose code
/// defaults to `github_bot_error`.
fn store_error_response(message: &str) -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({ "code": STORE_ERROR_CODE, "message": message }),
    ))
}
