mod helpers;
use helpers::*;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Mirrors `@tuturuuu/auth/mfa-mobile-approval` constants used by the legacy
// `pollMfaMobileApprovalChallenge` flow.
const MFA_MOBILE_APPROVAL_KIND: &str = "mfa_mobile_approval";
const MFA_MOBILE_APPROVAL_COOKIE_NAME: &str = "ttr_mfa_mobile_approval";
const MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS: i128 = 12 * 60 * 60;
const MFA_MOBILE_APPROVAL_COOKIE_MAX_AGE_SECONDS: i128 = MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS;

const INVALID_REQUEST_MESSAGE: &str = "Invalid request";
const AUTHENTICATION_REQUIRED_MESSAGE: &str = "Authentication required";
const GENERIC_ERROR_MESSAGE: &str = "Unable to process mobile MFA approval right now.";
const INVALID_CHALLENGE_ERROR: &str = "Invalid or expired mobile MFA approval request.";

// `MfaMobileApprovalPollQuerySchema`: secret length is `min(16).max(MAX_LONG_TEXT_LENGTH)`.
// `MAX_LONG_TEXT_LENGTH` in `@tuturuuu/utils/constants` is 10_000.
const SECRET_MIN_LENGTH: usize = 16;
const SECRET_MAX_LENGTH: usize = 10_000;

#[derive(Deserialize)]
struct ChallengeRow {
    approval_metadata: Option<Value>,
    expires_at: Option<String>,
    id: Option<String>,
    request_metadata: Option<Value>,
    status: Option<String>,
}

#[derive(Deserialize)]
struct ConsumedRow {
    // Returned representation of the consumed update; presence (non-empty) is
    // the only signal the legacy code relies on.
    #[serde(default)]
    id: Option<String>,
}

pub(crate) async fn handle_auth_mfa_mobile_challenges_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let challenge_id = mfa_mobile_challenge_id(request.path)?;

    match request.method {
        "GET" => Some(poll_response(config, request, challenge_id, outbound).await),
        // The bare-auth OPTIONS preflight for this path is handled by
        // route_request (returns a bare 204); returning None lets that flow run.
        "OPTIONS" => None,
        method => Some(no_store_response(method_not_allowed(method, "GET"))),
    }
}

/// Matches the 7-segment poll path
/// `/api/v1/auth/mfa/mobile/challenges/:challengeId` and extracts the dynamic
/// `challengeId` segment. The 8-segment `.../:challengeId/approve` path is owned
/// by a separate module, so it is deliberately rejected here (returns `None`).
fn mfa_mobile_challenge_id(path: &str) -> Option<&str> {
    let trimmed = path.trim_matches('/');
    let mut segments = trimmed.split('/').filter(|segment| !segment.is_empty());

    if segments.next()? != "api"
        || segments.next()? != "v1"
        || segments.next()? != "auth"
        || segments.next()? != "mfa"
        || segments.next()? != "mobile"
        || segments.next()? != "challenges"
    {
        return None;
    }

    let challenge_id = segments.next()?;
    if challenge_id.is_empty() || segments.next().is_some() {
        return None;
    }

    Some(challenge_id)
}

async fn poll_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    challenge_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // `MfaMobileApprovalPollQuerySchema.safeParse` + `!challengeId` guard.
    let Some(secret) = secret_from_url(request.url) else {
        return invalid_request_response();
    };

    let contact_data = &config.contact_data;

    // `getAuthenticatedMfaContext`: requires a Supabase auth user; 401 otherwise.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, AUTHENTICATION_REQUIRED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, AUTHENTICATION_REQUIRED_MESSAGE);
    };

    // `getChallengeBySecret`: id + secret_hash + approver_user_id (admin/service-role).
    let secret_hash = sha256_hex(&secret);
    let row = match fetch_challenge_by_secret(
        contact_data,
        outbound,
        challenge_id,
        &secret_hash,
        &user_id,
    )
    .await
    {
        // A null row (no match) and a query failure both collapse to the
        // invalid-challenge result in the legacy code (`getChallengeBySecret`
        // returns null on error).
        Ok(Some(row)) => row,
        Ok(None) | Err(()) => return invalid_challenge_response(404),
    };

    // `!isMobileMfaApprovalRow(row)` => invalid challenge.
    if !is_mobile_mfa_approval_row(&row) {
        return invalid_challenge_response(404);
    }

    if let Some(requester) = as_object(row.request_metadata.as_ref())
        .get("requesterSessionId")
        .and_then(Value::as_str)
    {
        if current_session_id(&access_token).as_deref() != Some(requester) {
            return invalid_challenge_response(404);
        }
    }
    let status = challenge_status(row.status.as_deref());

    if (status == "pending" || status == "approved") && is_expired(row.expires_at.as_deref()) {
        // Best-effort transition; legacy ignores update failures here.
        let _ = mark_expired(contact_data, outbound, challenge_id).await;
        return status_response(row.expires_at.as_deref(), "expired", false);
    }

    if status == "pending" {
        return status_response(row.expires_at.as_deref(), "pending", true);
    }

    if status == "approved" {
        return consume_approved(config, &access_token, &row, &secret, challenge_id, outbound)
            .await;
    }

    if status == "consumed" {
        return consumed_response(&access_token, &row, &secret, config);
    }

    // Any other terminal status (rejected/expired).
    status_response(row.expires_at.as_deref(), &status, false)
}

async fn consume_approved(
    config: &BackendConfig,
    access_token: &str,
    row: &ChallengeRow,
    secret: &str,
    challenge_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // `getCurrentSupabaseSessionId`: the `session_id` JWT claim.
    let Some(approver_session_id) = current_session_id(access_token) else {
        return message_response(400, GENERIC_ERROR_MESSAGE);
    };

    let consumed_at = now_iso8601();
    let mobile_mfa_valid_until =
        iso8601_from_millis(now_millis() + MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS * 1_000);

    // Merge existing approval_metadata with the new approval fields.
    let mut approval_metadata = as_object(row.approval_metadata.as_ref());
    approval_metadata.insert(
        "approverSessionId".to_owned(),
        Value::String(approver_session_id),
    );
    approval_metadata.insert(
        "mobileMfaSessionTtlSeconds".to_owned(),
        json!(MFA_MOBILE_APPROVAL_SESSION_TTL_SECONDS),
    );
    approval_metadata.insert(
        "mobileMfaValidUntil".to_owned(),
        Value::String(mobile_mfa_valid_until.clone()),
    );

    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("id", format!("eq.{challenge_id}")),
            ("status", "eq.approved".to_owned()),
            ("expires_at", format!("gt.{consumed_at}")),
            ("consumed_at", "is.null".to_owned()),
            ("select", "*".to_owned()),
        ],
    ) else {
        return message_response(500, GENERIC_ERROR_MESSAGE);
    };

    let body = json!({
        "approval_metadata": Value::Object(approval_metadata),
        "consumed_at": consumed_at,
        "status": "consumed",
    })
    .to_string();

    let consumed = match send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=representation"),
    )
    .await
    {
        Ok(response) if (200..300).contains(&response.status) => response
            .json::<Vec<ConsumedRow>>()
            .ok()
            .and_then(|rows| rows.into_iter().next()),
        // Error or non-2xx => generic 500 (legacy: `error || !data`).
        _ => return message_response(500, GENERIC_ERROR_MESSAGE),
    };

    // `!data` (no row updated) => generic 500.
    if consumed.and_then(|row| row.id).is_none() {
        return message_response(500, GENERIC_ERROR_MESSAGE);
    }

    let mut response = no_store_response(json_response(
        200,
        json!({
            "mobileMfaVerified": true,
            "status": "approved",
            "success": true,
            "validUntil": mobile_mfa_valid_until,
        }),
    ));
    set_approval_cookie(&mut response, challenge_id, secret, config);
    response
}

fn consumed_response(
    access_token: &str,
    row: &ChallengeRow,
    secret: &str,
    config: &BackendConfig,
) -> BackendResponse {
    let valid_until = current_session_id(access_token)
        .and_then(|session_id| approval_valid_until(row.approval_metadata.as_ref(), &session_id));

    let has_valid = valid_until.is_some();
    let valid_until_value = valid_until.clone().map_or(Value::Null, Value::String);

    let mut response = no_store_response(json_response(
        200,
        json!({
            "mobileMfaVerified": has_valid,
            "status": "consumed",
            "success": has_valid,
            "validUntil": valid_until_value,
        }),
    ));

    if has_valid {
        // The challenge id used for the cookie is the row id (matches legacy).
        let challenge_id = row.id.as_deref().unwrap_or("");
        set_approval_cookie(&mut response, challenge_id, secret, config);
    }

    response
}

async fn fetch_challenge_by_secret(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
    secret_hash: &str,
    user_id: &str,
) -> Result<Option<ChallengeRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{challenge_id}")),
            ("secret_hash", format!("eq.{secret_hash}")),
            ("approver_user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        None,
        None,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ChallengeRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn mark_expired(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("id", format!("eq.{challenge_id}")),
            ("status", "eq.pending".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let body = json!({ "status": "expired" }).to_string();
    send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=minimal"),
    )
    .await
    .map(|_| ())
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    prefer: Option<&'static str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if body.is_some() {
        request = request.with_header("Content-Type", APPLICATION_JSON);
    }
    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }
    if let Some(body) = body {
        request = request.with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Request metadata / status helpers (mirror the legacy pure functions).
// ---------------------------------------------------------------------------
