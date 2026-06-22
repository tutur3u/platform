use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fmt::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, method_not_allowed,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    text_response,
};

const TOPIC_ANNOUNCEMENT_VERIFICATION_PATH_PREFIX: &str =
    "/api/v1/topic-announcement-verifications/";
const TOPIC_ANNOUNCEMENT_VERIFICATION_TABLE: &str = "topic_announcement_contact_verifications";
const PRIVATE_SCHEMA: &str = "private";
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";

#[derive(Clone, Copy)]
enum VerificationTone {
    Error,
    Success,
    Warning,
}

impl VerificationTone {
    fn label(self) -> &'static str {
        match self {
            Self::Error => "Action needed",
            Self::Success => "Verified",
            Self::Warning => "Expired",
        }
    }
}

#[derive(Deserialize)]
struct VerificationRow {
    expires_at: Option<String>,
    id: String,
    status: Option<String>,
}

#[derive(Deserialize)]
struct PostgrestError {
    code: Option<String>,
}

pub(crate) async fn handle_topic_announcement_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let token = topic_announcement_verification_token(request.path)?;

    Some(match request.method {
        "GET" => {
            topic_announcement_verification_response(
                &config.contact_data,
                &decode_path_segment(token),
                outbound,
            )
            .await
        }
        method => method_not_allowed(method, "GET"),
    })
}

async fn topic_announcement_verification_response(
    contact_data: &contact::ContactDataConfig,
    token: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if token.is_empty() {
        return verification_html_page(
            400,
            VerificationTone::Error,
            "Invalid verification link",
            "The verification token is missing.",
        );
    }

    let now = now_iso_timestamp();
    let token_hash = sha256_hex(token);
    let row = match fetch_verification_row(contact_data, &token_hash, outbound).await {
        Ok(row) => row,
        Err(()) => {
            return verification_failed_response();
        }
    };

    let Some(row) = row else {
        return verification_unavailable_response();
    };

    if row.status.as_deref() != Some("pending") {
        return verification_unavailable_response();
    }

    if row
        .expires_at
        .as_deref()
        .is_some_and(|expires_at| expires_at < now.as_str())
    {
        let _ = update_verification_status(
            contact_data,
            &row.id,
            json!({
                "status": "expired",
            }),
            outbound,
        )
        .await;

        return verification_html_page(
            410,
            VerificationTone::Warning,
            "Verification link expired",
            "Please request a new Topic Announcements verification email.",
        );
    }

    if update_verification_status(
        contact_data,
        &row.id,
        json!({
            "status": "verified",
            "verified_at": now,
        }),
        outbound,
    )
    .await
    .is_err()
    {
        return verification_failed_response();
    }

    verification_html_page(
        200,
        VerificationTone::Success,
        "Email verified",
        "This email address can now receive Topic Announcements from enabled Tuturuuu workspaces.",
    )
}

async fn fetch_verification_row(
    contact_data: &contact::ContactDataConfig,
    token_hash: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<VerificationRow>, ()> {
    let url = verification_rest_url(
        contact_data,
        &[
            ("select", "id,expires_at,status".to_owned()),
            ("token_hash", format!("eq.{token_hash}")),
        ],
    )?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let request = OutboundRequest::new(OutboundMethod::Get, &url)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Accept", POSTGREST_SINGLE_JSON);

    let response = outbound.send(request).await.map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return if is_postgrest_single_not_found(&response) {
            Ok(None)
        } else {
            Err(())
        };
    }

    let body = response.json::<serde_json::Value>().map_err(|_| ())?;
    if body.is_null() {
        return Ok(None);
    }

    serde_json::from_value::<VerificationRow>(body)
        .map(Some)
        .map_err(|_| ())
}

async fn update_verification_status(
    contact_data: &contact::ContactDataConfig,
    id: &str,
    payload: serde_json::Value,
    outbound: &impl OutboundHttpClient,
) -> Result<(), ()> {
    let body = serde_json::to_string(&payload).map_err(|_| ())?;
    let url = verification_rest_url(contact_data, &[("id", format!("eq.{id}"))])?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let request = OutboundRequest::new(OutboundMethod::Patch, &url)
        .with_header("Accept-Profile", PRIVATE_SCHEMA)
        .with_header("Content-Profile", PRIVATE_SCHEMA)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key)
        .with_header("Content-Type", APPLICATION_JSON)
        .with_header("Prefer", "return=minimal")
        .with_body(&body);
    let response = outbound.send(request).await.map_err(|_| ())?;

    if (200..300).contains(&response.status) {
        Ok(())
    } else {
        Err(())
    }
}

fn verification_rest_url(
    contact_data: &contact::ContactDataConfig,
    params: &[(&str, String)],
) -> Result<String, ()> {
    if !contact_data.configured() {
        return Err(());
    }

    contact_data
        .rest_url(TOPIC_ANNOUNCEMENT_VERIFICATION_TABLE, params)
        .ok_or(())
}

fn topic_announcement_verification_token(path: &str) -> Option<&str> {
    let token = path.strip_prefix(TOPIC_ANNOUNCEMENT_VERIFICATION_PATH_PREFIX)?;

    (!token.contains('/')).then_some(token)
}

fn sha256_hex(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        let _ = write!(&mut encoded, "{byte:02x}");
    }
    encoded
}

fn decode_path_segment(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
        {
            decoded.push(high * 16 + low);
            index += 3;
            continue;
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    match String::from_utf8(decoded) {
        Ok(value) => value,
        Err(error) => String::from_utf8_lossy(&error.into_bytes()).into_owned(),
    }
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn is_postgrest_single_not_found(response: &OutboundResponse) -> bool {
    response
        .json::<PostgrestError>()
        .ok()
        .and_then(|error| error.code)
        .as_deref()
        == Some(POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
}

fn verification_failed_response() -> BackendResponse {
    verification_html_page(
        500,
        VerificationTone::Error,
        "Verification failed",
        "We could not verify this email address. Please request a new verification link.",
    )
}

fn verification_unavailable_response() -> BackendResponse {
    verification_html_page(
        404,
        VerificationTone::Error,
        "Verification link unavailable",
        "This verification link is invalid or has already been used.",
    )
}

fn verification_html_page(
    status: u16,
    tone: VerificationTone,
    title: &str,
    message: &str,
) -> BackendResponse {
    let escaped_title = escape_html(title);
    let escaped_message = escape_html(message);
    let escaped_tone = escape_html(tone.label());
    let body = format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escaped_title}</title><style>:root{{color-scheme:light dark}}body{{margin:0;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{min-height:100vh;display:grid;place-items:center;padding:32px 20px}}.shell{{width:min(100%,680px);border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.08);overflow:hidden}}.bar{{height:6px;background:#0f172a}}.content{{padding:32px}}.eyebrow{{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}}.icon{{display:grid;place-items:center;width:48px;height:48px;border-radius:999px;margin-bottom:20px;background:#f1f5f9;color:#0f172a;font-weight:800}}h1{{margin:8px 0 12px;font-size:clamp(28px,5vw,40px);line-height:1.05;letter-spacing:-.02em}}p{{margin:0;color:#475569;font-size:16px;line-height:1.7}}.actions{{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}}a{{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid #0f172a;background:#0f172a;color:#fff;padding:10px 14px;font-weight:650;text-decoration:none}}.secondary{{background:#fff;color:#0f172a}}@media (prefers-color-scheme:dark){{body{{background:#020617;color:#f8fafc}}.shell{{border-color:#1e293b;background:#0f172a}}.bar{{background:#f8fafc}}.eyebrow,p{{color:#cbd5e1}}.icon{{background:#1e293b;color:#f8fafc}}a{{border-color:#f8fafc;background:#f8fafc;color:#020617}}.secondary{{background:#0f172a;color:#f8fafc}}}}</style></head><body><main><section class="shell"><div class="bar"></div><div class="content"><div class="icon">OK</div><div class="eyebrow">{escaped_tone}</div><h1>{escaped_title}</h1><p>{escaped_message}</p><div class="actions"><a href="https://tuturuuu.com">Open Tuturuuu</a><a class="secondary" href="mailto:support@tuturuuu.com">Contact support</a></div></div></section></main></body></html>"#
    );

    no_store_response(text_response(status, body, "text/html; charset=utf-8"))
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn now_iso_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    unix_millis_to_iso_timestamp(
        duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis()),
    )
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
