mod helpers;
use helpers::*;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const QR_LOGIN_GENERIC_ERROR: &str = "Unable to process QR login right now.";
const QR_LOGIN_INVALID_CHALLENGE_ERROR: &str = "Invalid or expired QR login request.";
const INVALID_REQUEST_MESSAGE: &str = "Invalid request";
const SECRET_MIN_LENGTH: usize = 16;
const SECRET_MAX_LENGTH: usize = 10_000;

#[derive(Deserialize)]
struct QrLoginChallengeRow {
    expires_at: Option<String>,
    status: Option<String>,
    request_metadata: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct QrLoginConsumedRow {
    approver_email: Option<String>,
    approver_user_id: Option<String>,
}

#[derive(Deserialize)]
struct GenerateLinkResponse {
    #[serde(default)]
    action_link: Option<String>,
    #[serde(default)]
    hashed_token: Option<String>,
    #[serde(default)]
    properties: Option<GenerateLinkProperties>,
}

#[derive(Deserialize)]
struct GenerateLinkProperties {
    #[serde(default)]
    action_link: Option<String>,
    #[serde(default)]
    hashed_token: Option<String>,
}

#[derive(Deserialize)]
struct AdminUserResponse {
    email: Option<String>,
}

#[derive(Deserialize)]
struct VerifyOtpSession {
    access_token: Option<String>,
    #[serde(default)]
    expires_at: Option<i64>,
    #[serde(default)]
    expires_in: Option<i64>,
    refresh_token: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
}

#[derive(Serialize)]
struct SessionPayload {
    access_token: String,
    expires_at: Option<i64>,
    expires_in: i64,
    refresh_token: String,
    token_type: String,
}

pub(crate) async fn handle_auth_qr_login_challenges_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let challenge_id = qr_login_challenge_id(request.path)?;

    Some(match request.method {
        "GET" => poll_response(config, request, challenge_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

/// Matches the 6-segment poll path `/api/v1/auth/qr-login/challenges/:challengeId`
/// and extracts the dynamic `challengeId` segment. The 7-segment
/// `.../:challengeId/approve` path is owned by a separate module, so it is
/// deliberately rejected here (returns `None`).
fn qr_login_challenge_id(path: &str) -> Option<&str> {
    let trimmed = path.trim_matches('/');
    let mut segments = trimmed.split('/').filter(|segment| !segment.is_empty());

    if segments.next()? != "api"
        || segments.next()? != "v1"
        || segments.next()? != "auth"
        || segments.next()? != "qr-login"
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
    let Some(secret) = secret_from_url(request.url) else {
        return invalid_request_response();
    };

    let contact_data = &config.contact_data;
    let secret_hash = sha256_hex(&secret);

    let row =
        match fetch_challenge_by_secret(contact_data, outbound, challenge_id, &secret_hash).await {
            Ok(Some(row)) => row,
            Ok(None) => return invalid_challenge_response(404),
            Err(()) => return generic_error_response(),
        };

    if row
        .request_metadata
        .as_ref()
        .and_then(|m| m.get("kind"))
        .and_then(|v| v.as_str())
        == Some("mfa_mobile_approval")
    {
        return invalid_challenge_response(404);
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

    if status != "approved" {
        return status_response(row.expires_at.as_deref(), &status, status == "consumed");
    }

    // Approved: consume the challenge and issue a session.
    let consumed = match consume_approved_challenge(contact_data, outbound, challenge_id).await {
        Ok(Some(consumed)) => consumed,
        Ok(None) | Err(()) => return generic_error_response(),
    };

    let Some(approver_user_id) = consumed.approver_user_id.filter(|id| !id.trim().is_empty())
    else {
        return generic_error_response();
    };

    match issue_session_for_user(
        contact_data,
        outbound,
        &approver_user_id,
        consumed.approver_email.as_deref(),
    )
    .await
    {
        Ok(session) => no_store_response(json_response(
            200,
            json!({
                "session": session,
                "status": "approved",
                "success": true,
            }),
        )),
        Err(()) => generic_error_response(),
    }
}

async fn fetch_challenge_by_secret(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
    secret_hash: &str,
) -> Result<Option<QrLoginChallengeRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{challenge_id}")),
            ("secret_hash", format!("eq.{secret_hash}")),
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
        .json::<Vec<QrLoginChallengeRow>>()
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

async fn consume_approved_challenge(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    challenge_id: &str,
) -> Result<Option<QrLoginConsumedRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "qr_login_challenges",
        &[
            ("id", format!("eq.{challenge_id}")),
            ("status", "eq.approved".to_owned()),
            ("expires_at", format!("gt.{}", now_iso8601())),
            ("consumed_at", "is.null".to_owned()),
            ("select", "*".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let consumed_at = now_iso8601();
    let body = json!({
        "consumed_at": consumed_at,
        "status": "consumed",
    })
    .to_string();

    let response = send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        Some(&body),
        Some("return=representation"),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<QrLoginConsumedRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn issue_session_for_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    email: Option<&str>,
) -> Result<SessionPayload, ()> {
    let user_email = match email.filter(|value| !value.trim().is_empty()) {
        Some(email) => email.to_owned(),
        None => fetch_user_email(contact_data, outbound, user_id).await?,
    };

    let token_hash = generate_magic_link_token(contact_data, outbound, &user_email).await?;
    verify_magic_link_otp(contact_data, outbound, &token_hash).await
}

async fn fetch_user_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<String, ()> {
    let url = contact_data
        .auth_url(&format!("admin/users/{user_id}"))
        .ok_or(())?;

    let response =
        send_admin_auth_request(contact_data, outbound, OutboundMethod::Get, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response
        .json::<AdminUserResponse>()
        .map_err(|_| ())?
        .email
        .filter(|email| !email.trim().is_empty())
        .ok_or(())
}

async fn generate_magic_link_token(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    email: &str,
) -> Result<String, ()> {
    let url = contact_data.auth_url("admin/generate_link").ok_or(())?;
    let body = json!({
        "type": "magiclink",
        "email": email,
        "data": {
            "auth_client": "qr_login",
            "origin": "TUTURUUU_WEB_QR",
        },
    })
    .to_string();

    let response = send_admin_auth_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(&body),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let parsed = response.json::<GenerateLinkResponse>().map_err(|_| ())?;

    // GoTrue may surface fields at the top level or nested under `properties`.
    if let Some(token) = parsed
        .hashed_token
        .or_else(|| {
            parsed
                .properties
                .as_ref()
                .and_then(|p| p.hashed_token.clone())
        })
        .filter(|token| !token.trim().is_empty())
    {
        return Ok(token);
    }

    let action_link = parsed
        .action_link
        .or_else(|| parsed.properties.and_then(|p| p.action_link))
        .filter(|link| !link.trim().is_empty())
        .ok_or(())?;

    token_hash_from_action_link(&action_link).ok_or(())
}

async fn verify_magic_link_otp(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    token_hash: &str,
) -> Result<SessionPayload, ()> {
    let url = contact_data.auth_url("verify").ok_or(())?;
    let body = json!({
        "type": "magiclink",
        "token_hash": token_hash,
    })
    .to_string();

    let response = send_admin_auth_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(&body),
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let session = response.json::<VerifyOtpSession>().map_err(|_| ())?;
    let access_token = session
        .access_token
        .filter(|token| !token.trim().is_empty())
        .ok_or(())?;
    let refresh_token = session
        .refresh_token
        .filter(|token| !token.trim().is_empty())
        .ok_or(())?;

    Ok(SessionPayload {
        access_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in.unwrap_or(0),
        refresh_token,
        token_type: session.token_type.unwrap_or_else(|| "bearer".to_owned()),
    })
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

async fn send_admin_auth_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
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
    if let Some(body) = body {
        request = request.with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}
