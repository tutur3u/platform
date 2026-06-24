//! Provider calendar listing route
//! (`GET /api/v1/calendar/auth/provider-calendars`).
//!
//! Mirrors `apps/web/src/app/api/v1/calendar/auth/provider-calendars/route.ts`.
//!
//! Flow:
//!   1. Validate query params (`wsId` required, max 255; optional `accountId`,
//!      max 10000). On failure return `400 { "error": "Missing or invalid
//!      workspace ID" }`.
//!   2. Authenticate the caller (Supabase access token or `calendar` app
//!      session), then resolve + verify workspace membership. Membership
//!      lookup failures return `500`, non-members return `403`.
//!   3. Read active `calendar_auth_tokens` rows for the user + workspace
//!      (optionally filtered to a single `accountId`), ordered by `created_at`
//!      ascending. A read failure returns
//!      `500 { "error": "Failed to fetch connected accounts" }`.
//!   4. For each token, call the provider API (Google Calendar List API or
//!      Microsoft Graph `/me/calendars`) with the stored access token and map
//!      the entries into the unified calendar shape. Any per-account failure
//!      degrades to an empty list for that account (mirrors the legacy
//!      try/catch).
//!   5. Return `200 { calendars, byAccount, accounts }`.
//!
//! IMPORTANT differences from the legacy route flagged for the integrator:
//! - The legacy route uses the Google `OAuth2Client`, which transparently
//!   refreshes the access token via the refresh token before calling
//!   `calendarList.list`. This port replicates that by issuing a refresh-token
//!   grant against `https://oauth2.googleapis.com/token` when the initial
//!   Google API call returns `401`, then retrying once. Microsoft tokens are
//!   used as-is (the legacy `createGraphClient` does not auto-refresh either).
//! - `calendar_auth_tokens` is read with the SERVICE ROLE key (the backend
//!   pattern), with an explicit `user_id = caller` filter to preserve the
//!   RLS-equivalent scoping the legacy authenticated client relied on.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PROVIDER_CALENDARS_PATH: &str = "/api/v1/calendar/auth/provider-calendars";
const CALENDAR_AUTH_APP_SESSION_TARGETS: [&str; 1] = ["calendar"];

const INVALID_WS_ID_MESSAGE: &str = "Missing or invalid workspace ID";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FORBIDDEN_MESSAGE: &str = "Forbidden";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const TOKENS_FETCH_FAILED_MESSAGE: &str = "Failed to fetch connected accounts";

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

// Mirrors `@tuturuuu/utils/constants`.
const MAX_NAME_LENGTH: usize = 255;
const MAX_LONG_TEXT_LENGTH: usize = 10000;

const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_LIST_URL: &str =
    "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const MICROSOFT_CALENDARS_URL: &str = "https://graph.microsoft.com/v1.0/me/calendars";

const GOOGLE_DEFAULT_BACKGROUND: &str = "#4285F4";
const GOOGLE_DEFAULT_FOREGROUND: &str = "#FFFFFF";
const MICROSOFT_DEFAULT_BACKGROUND: &str = "#0078D4";
const MICROSOFT_DEFAULT_FOREGROUND: &str = "#FFFFFF";
const DEFAULT_CALENDAR_NAME: &str = "Untitled Calendar";
const DEFAULT_ACCESS_ROLE: &str = "reader";

// Mirrors `MICROSOFT_CALENDAR_COLORS` from `@tuturuuu/microsoft`.
fn microsoft_color_hex(color: Option<&str>) -> &'static str {
    match color.unwrap_or("auto") {
        "lightBlue" => "#71AFE5",
        "lightGreen" => "#7ED321",
        "lightOrange" => "#FFBE00",
        "lightGray" => "#A0AEB2",
        "lightYellow" => "#FFF100",
        "lightTeal" => "#00ABA9",
        "lightPink" => "#FF69B4",
        "lightBrown" => "#D2691E",
        "lightRed" => "#FF6347",
        // "auto" and "maxColor" both map to the default brand blue.
        _ => "#0078D4",
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum DataAuth {
    AccessToken(String),
    ServiceRole,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Caller {
    data_auth: DataAuth,
    id: String,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct CalendarAuthTokenRow {
    id: Option<String>,
    provider: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    account_email: Option<String>,
    account_name: Option<String>,
}

#[derive(Deserialize)]
struct GoogleTokenRefreshResponse {
    access_token: Option<String>,
}

pub(crate) async fn handle_calendar_auth_provider_calendars_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != PROVIDER_CALENDARS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => provider_calendars_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn provider_calendars_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Step 1: query validation (mirrors zod safeParse).
    let query = parse_query(request.url);
    let Some(raw_ws_id) = query.ws_id else {
        return message_response(400, INVALID_WS_ID_MESSAGE);
    };
    if raw_ws_id.len() > MAX_NAME_LENGTH {
        return message_response(400, INVALID_WS_ID_MESSAGE);
    }
    if let Some(account_id) = query.account_id.as_deref()
        && account_id.len() > MAX_LONG_TEXT_LENGTH
    {
        return message_response(400, INVALID_WS_ID_MESSAGE);
    }

    // Step 2: authentication + workspace membership.
    let caller = match resolve_caller(config, request, outbound).await {
        Ok(caller) => caller,
        Err(response) => return response,
    };

    let resolved_ws_id =
        match normalize_workspace_id(&config.contact_data, outbound, &raw_ws_id, &caller).await {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    match verify_workspace_member(&config.contact_data, outbound, &resolved_ws_id, &caller).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, FORBIDDEN_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    // Step 3: read connected accounts.
    let tokens = match fetch_calendar_auth_tokens(
        &config.contact_data,
        outbound,
        &caller.id,
        &resolved_ws_id,
        query.account_id.as_deref(),
    )
    .await
    {
        Ok(tokens) => tokens,
        Err(()) => return message_response(500, TOKENS_FETCH_FAILED_MESSAGE),
    };

    // Step 4: fetch provider calendars per account.
    let mut by_account: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let mut calendars: Vec<Value> = Vec::new();
    let mut accounts: Vec<Value> = Vec::new();

    for token in &tokens {
        let token_id = token.id.clone().unwrap_or_default();
        let provider = token.provider.clone().unwrap_or_default();
        let account_email = token.account_email.clone();

        accounts.push(json!({
            "id": token_id,
            "provider": provider,
            "email": account_email,
            "name": token.account_name,
        }));

        let account_calendars = match provider.as_str() {
            "google" => {
                fetch_google_calendars(outbound, token, &token_id, account_email.as_deref()).await
            }
            "microsoft" => {
                fetch_microsoft_calendars(outbound, token, &token_id, account_email.as_deref())
                    .await
            }
            // Unknown providers are simply skipped (no byAccount entry), exactly
            // like the legacy loop which only handles google/microsoft.
            _ => continue,
        };

        let account_calendars = account_calendars.unwrap_or_default();
        calendars.extend(account_calendars.iter().cloned());
        by_account.insert(token_id, account_calendars);
    }

    let by_account_value: serde_json::Map<String, Value> = by_account
        .into_iter()
        .map(|(key, value)| (key, Value::Array(value)))
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "calendars": calendars,
            "byAccount": Value::Object(by_account_value),
            "accounts": accounts,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Provider calendar fetching
// ---------------------------------------------------------------------------

async fn fetch_google_calendars(
    outbound: &impl OutboundHttpClient,
    token: &CalendarAuthTokenRow,
    token_id: &str,
    account_email: Option<&str>,
) -> Option<Vec<Value>> {
    let access_token = token.access_token.clone()?;

    // First attempt with the stored access token.
    let response = google_calendar_list_request(outbound, &access_token)
        .await
        .ok()?;

    let body = if response.status == 401 {
        // Mirror the Google SDK auto-refresh behaviour.
        let refresh_token = token.refresh_token.as_deref()?;
        let refreshed = refresh_google_access_token(outbound, refresh_token).await?;
        let retry = google_calendar_list_request(outbound, &refreshed)
            .await
            .ok()?;
        if !(200..300).contains(&retry.status) {
            return None;
        }
        retry.body_text
    } else if (200..300).contains(&response.status) {
        response.body_text
    } else {
        return None;
    };

    let parsed: Value = serde_json::from_str(&body).ok()?;
    let items = parsed
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Some(
        items
            .iter()
            .map(|entry| {
                json!({
                    "id": str_or_default(entry, "id", ""),
                    "name": non_empty_str(entry, "summary").unwrap_or(DEFAULT_CALENDAR_NAME.to_owned()),
                    "description": str_or_default(entry, "description", ""),
                    "primary": entry.get("primary").and_then(Value::as_bool).unwrap_or(false),
                    "backgroundColor": non_empty_str(entry, "backgroundColor")
                        .unwrap_or(GOOGLE_DEFAULT_BACKGROUND.to_owned()),
                    "foregroundColor": non_empty_str(entry, "foregroundColor")
                        .unwrap_or(GOOGLE_DEFAULT_FOREGROUND.to_owned()),
                    "accessRole": non_empty_str(entry, "accessRole")
                        .unwrap_or(DEFAULT_ACCESS_ROLE.to_owned()),
                    "provider": "google",
                    "accountId": token_id,
                    "accountEmail": account_email,
                })
            })
            .collect(),
    )
}

async fn fetch_microsoft_calendars(
    outbound: &impl OutboundHttpClient,
    token: &CalendarAuthTokenRow,
    token_id: &str,
    account_email: Option<&str>,
) -> Option<Vec<Value>> {
    let access_token = token.access_token.clone()?;
    let authorization = format!("Bearer {access_token}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, MICROSOFT_CALENDARS_URL)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    let parsed: Value = serde_json::from_str(&response.body_text).ok()?;
    let items = parsed
        .get("value")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    Some(
        items
            .iter()
            .map(|entry| {
                let can_edit = entry.get("canEdit").and_then(Value::as_bool).unwrap_or(false);
                let color = entry.get("color").and_then(Value::as_str);
                json!({
                    "id": entry.get("id").and_then(Value::as_str),
                    "name": entry.get("name").and_then(Value::as_str),
                    "description": "",
                    "primary": entry.get("isDefaultCalendar").and_then(Value::as_bool).unwrap_or(false),
                    "backgroundColor": microsoft_color_hex(color),
                    "foregroundColor": MICROSOFT_DEFAULT_FOREGROUND,
                    "accessRole": if can_edit { "writer" } else { "reader" },
                    "provider": "microsoft",
                    "accountId": token_id,
                    "accountEmail": account_email,
                })
            })
            .collect(),
    )
}

async fn google_calendar_list_request(
    outbound: &impl OutboundHttpClient,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let Some(url) = build_url(
        GOOGLE_CALENDAR_LIST_URL,
        &[
            ("minAccessRole", "reader"),
            ("showHidden", "false"),
            ("showDeleted", "false"),
        ],
    ) else {
        return Err(());
    };
    let authorization = format!("Bearer {access_token}");

    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization),
        )
        .await
        .map_err(|_| ())
}

async fn refresh_google_access_token(
    outbound: &impl OutboundHttpClient,
    refresh_token: &str,
) -> Option<String> {
    let client_id = trimmed_env("GOOGLE_CLIENT_ID")?;
    let client_secret = trimmed_env("GOOGLE_CLIENT_SECRET")?;

    // Build the form body in a synchronous helper so the non-`Send`
    // `form_urlencoded::Serializer` is never held across the `.await` below
    // (required for the Worker/wasm non-`Send` future).
    let body = encode_refresh_token_body(&client_id, &client_secret, refresh_token);

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, GOOGLE_TOKEN_URL)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", "application/x-www-form-urlencoded")
                .with_body(&body),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    response
        .json::<GoogleTokenRefreshResponse>()
        .ok()?
        .access_token
        .filter(|token| !token.trim().is_empty())
}

// ---------------------------------------------------------------------------
// Supabase data access
// ---------------------------------------------------------------------------

async fn fetch_calendar_auth_tokens(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    ws_id: &str,
    account_id: Option<&str>,
) -> Result<Vec<CalendarAuthTokenRow>, ()> {
    let mut params = vec![
        (
            "select",
            "id,provider,access_token,refresh_token,account_email,account_name".to_owned(),
        ),
        ("user_id", format!("eq.{user_id}")),
        ("ws_id", format!("eq.{ws_id}")),
        ("is_active", "eq.true".to_owned()),
        ("order", "created_at.asc".to_owned()),
    ];
    if let Some(account_id) = account_id {
        params.push(("id", format!("eq.{account_id}")));
    }

    let Some(url) = contact_data.rest_url("calendar_auth_tokens", &params) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<CalendarAuthTokenRow>>().map_err(|_| ())
}

async fn resolve_caller(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<Caller, BackendResponse> {
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            &CALENDAR_AUTH_APP_SESSION_TARGETS,
        )
        .map_err(|_| message_response(401, UNAUTHORIZED_MESSAGE))?;

        return Ok(Caller {
            data_auth: DataAuth::ServiceRole,
            id: identity.id,
        });
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(message_response(401, UNAUTHORIZED_MESSAGE));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Err(message_response(401, UNAUTHORIZED_MESSAGE));
    };

    Ok(Caller {
        data_auth: DataAuth::AccessToken(access_token),
        id: user_id,
    })
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    caller: &Caller,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, caller).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, caller).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    caller: &Caller,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{}", caller.id)),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &caller.data_auth).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    caller: &Caller,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &caller.data_auth).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &DataAuth::ServiceRole).await?;

    if !(200..300).contains(&response.status) {
        return Ok(None);
    }

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    caller: &Caller,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{}", caller.id)),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_rest_request(contact_data, outbound, &url, &caller.data_auth).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn send_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    auth: &DataAuth,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = match auth {
        DataAuth::AccessToken(access_token) => format!("Bearer {access_token}"),
        DataAuth::ServiceRole => format!("Bearer {service_role_key}"),
    };

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

// ---------------------------------------------------------------------------
// Query + workspace helpers (mirrors calendar_auth.rs)
// ---------------------------------------------------------------------------

struct ProviderCalendarsQuery {
    ws_id: Option<String>,
    account_id: Option<String>,
}

fn parse_query(request_url: Option<&str>) -> ProviderCalendarsQuery {
    let mut ws_id = None;
    let mut account_id = None;

    if let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "wsId" if ws_id.is_none() => ws_id = Some(value.into_owned()),
                "accountId" if account_id.is_none() => account_id = Some(value.into_owned()),
                _ => {}
            }
        }
    }

    // `wsId` is required + non-empty; an empty string fails zod's `.max()` only
    // through `safeParse` shape, but the legacy schema treats an empty string as
    // present (length 0). The Supabase filter would then never match, returning
    // 403. To preserve the legacy behaviour exactly we keep an empty wsId as
    // Some("") rather than treating it as missing.
    ProviderCalendarsQuery { ws_id, account_id }
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();

    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }

    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

fn encode_refresh_token_body(client_id: &str, client_secret: &str, refresh_token: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .append_pair("client_id", client_id)
        .append_pair("client_secret", client_secret)
        .append_pair("grant_type", "refresh_token")
        .append_pair("refresh_token", refresh_token)
        .finish()
}

fn build_url(base: &str, params: &[(&str, &str)]) -> Option<String> {
    let mut url = url::Url::parse(base).ok()?;
    {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in params {
            pairs.append_pair(key, value);
        }
    }
    Some(url.into())
}

fn trimmed_env(key: &str) -> Option<String> {
    let value = std::env::var(key).ok()?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Returns the string at `key` if present and non-empty, mirroring the legacy
/// `entry.summary || 'fallback'` semantics where empty strings fall back.
fn non_empty_str(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|candidate| !candidate.is_empty())
        .map(str::to_owned)
}

/// Returns the string at `key`, or `default` when missing/non-string/empty,
/// mirroring `entry.id || ''` semantics.
fn str_or_default(value: &Value, key: &str, default: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|candidate| !candidate.is_empty())
        .unwrap_or(default)
        .to_owned()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
