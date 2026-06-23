use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const AUTH_MFA_MOBILE_APPROVALS_PATH: &str = "/api/v1/auth/mfa/mobile/approvals";
const MFA_MOBILE_APPROVAL_KIND: &str = "mfa_mobile_approval";
const AAL2: &str = "aal2";
const AUTHENTICATION_REQUIRED_MESSAGE: &str = "Authentication required";
const GENERIC_ERROR_MESSAGE: &str = "Unable to process mobile MFA approval right now.";

/// Statuses surfaced for an approval challenge. Mirrors `challengeStatus()` in
/// the legacy `mfa-mobile-approval.ts`: any unknown status collapses to
/// `expired`.
fn challenge_status(value: &str) -> &str {
    match value {
        "approved" | "consumed" | "expired" | "pending" | "rejected" => value,
        _ => "expired",
    }
}

#[derive(Deserialize)]
struct ApprovalRow {
    created_at: Option<String>,
    expires_at: Option<String>,
    id: Option<String>,
    request_metadata: Option<Value>,
    status: Option<String>,
}

pub(crate) async fn handle_auth_mfa_mobile_approvals_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != AUTH_MFA_MOBILE_APPROVALS_PATH {
        return None;
    }

    match request.method {
        "GET" => {
            Some(list_pending_approvals_response(&config.contact_data, request, outbound).await)
        }
        // OPTIONS preflight for this bare-auth path is handled by route_request
        // (returns a bare 204). Returning None lets that flow continue.
        "OPTIONS" => None,
        method => Some(no_store_response(method_not_allowed(method, "GET"))),
    }
}

async fn list_pending_approvals_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Authenticate via the Supabase auth user (cookie/bearer), mirroring the
    // reference handler. `getAuthenticatedMfaContext` returns 401 when there is
    // no user.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, AUTHENTICATION_REQUIRED_MESSAGE);
    };

    let user_id =
        match supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
        {
            Some(user_id) => user_id,
            None => return message_response(401, AUTHENTICATION_REQUIRED_MESSAGE),
        };

    // The legacy code derives the AAL from `supabase.auth.mfa
    // .getAuthenticatorAssuranceLevel()`, whose `currentLevel` is the JWT `aal`
    // claim. A failure to read the assurance level returns 400 with the error
    // message; here a malformed JWT yields the generic 500 path because we can
    // not produce a Supabase-shaped assurance error message.
    let Ok(current_level) = current_assurance_level(&access_token) else {
        return message_response(500, GENERIC_ERROR_MESSAGE);
    };

    // Below AAL2 the mobile session cannot list approvals; legacy returns an
    // empty list with `requiresMobileMfa: true`.
    if current_level.as_deref() != Some(AAL2) {
        return no_store_response(json_response(
            200,
            json!({
                "approvals": [],
                "requiresMobileMfa": true,
                "success": true,
            }),
        ));
    }

    let now = now_iso8601();
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            (
                "select",
                "created_at,expires_at,id,request_metadata,status".to_owned(),
            ),
            ("approver_user_id", format!("eq.{user_id}")),
            ("status", "eq.pending".to_owned()),
            ("expires_at", format!("gt.{now}")),
            (
                "request_metadata",
                format!("cs.{{\"kind\":\"{MFA_MOBILE_APPROVAL_KIND}\"}}"),
            ),
            ("order", "created_at.desc".to_owned()),
            ("limit", "5".to_owned()),
        ],
    ) else {
        return message_response(500, GENERIC_ERROR_MESSAGE);
    };

    let rows = match fetch_approval_rows(contact_data, outbound, &url).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, GENERIC_ERROR_MESSAGE),
    };

    let approvals: Vec<Value> = rows.into_iter().filter_map(approval_entry).collect();

    no_store_response(json_response(
        200,
        json!({
            "approvals": approvals,
            "requiresMobileMfa": false,
            "success": true,
        }),
    ))
}

/// Maps a single row to the API entry, returning `None` when the row lacks a
/// string `pairCode` or is not an mfa-mobile-approval row. Mirrors the
/// `flatMap` body of `listPendingMfaMobileApprovals`.
fn approval_entry(row: ApprovalRow) -> Option<Value> {
    let metadata = as_record(row.request_metadata.as_ref());

    let pair_code = metadata.get("pairCode").and_then(Value::as_str)?;

    if metadata.get("kind").and_then(Value::as_str) != Some(MFA_MOBILE_APPROVAL_KIND) {
        return None;
    }

    let status = row.status.as_deref().unwrap_or("");

    Some(json!({
        "createdAt": row.created_at,
        "expiresAt": row.expires_at,
        "id": row.id,
        "pairCode": pair_code,
        "status": challenge_status(status),
    }))
}

/// Returns the object form of `request_metadata`, or an empty object for any
/// non-object value, matching `asRecord()`.
fn as_record(value: Option<&Value>) -> serde_json::Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => serde_json::Map::new(),
    }
}

async fn fetch_approval_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<Vec<ApprovalRow>, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<ApprovalRow>>().map_err(|_| ())
}

/// Reads the `aal` claim from the JWT access token. Returns `Err` only when the
/// token is not a parseable JWT.
fn current_assurance_level(access_token: &str) -> Result<Option<String>, ()> {
    let payload = jwt_payload(access_token)?;

    Ok(payload
        .get("aal")
        .and_then(Value::as_str)
        .map(str::to_owned))
}

fn jwt_payload(access_token: &str) -> Result<Value, ()> {
    let mut segments = access_token.split('.');
    let _header = segments.next().ok_or(())?;
    let payload = segments.next().ok_or(())?;
    let _signature = segments.next().ok_or(())?;

    if segments.next().is_some() || payload.trim().is_empty() {
        return Err(());
    }

    let mut padded_payload = payload.to_owned();
    while padded_payload.len() % 4 != 0 {
        padded_payload.push('=');
    }
    let decoded = URL_SAFE.decode(padded_payload.as_bytes()).map_err(|_| ())?;

    serde_json::from_slice::<Value>(&decoded).map_err(|_| ())
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Time helpers (ISO-8601 UTC, matching JS Date#toISOString output shape).
// Mirrors the helpers in hive_ai_credits.rs.
// ---------------------------------------------------------------------------

fn unix_millis_now() -> i64 {
    let duration = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis())
}

fn now_iso8601() -> String {
    unix_millis_to_iso_timestamp(unix_millis_now())
}

fn unix_millis_to_iso_timestamp(unix_millis: i64) -> String {
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}
