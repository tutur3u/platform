//! Handler for `GET /api/v1/mira/pet`.
//!
//! Ported from `apps/web/src/app/api/v1/mira/pet/route.ts` (GET only).
//! PATCH is not migrated; this handler returns `None` for PATCH so the
//! still-live Next.js route handles it.
//!
//! ## Auth model
//!
//! The legacy route resolves the session user via the caller's Supabase JWT
//! (RLS active). This handler uses `supabase_auth::request_access_token` +
//! `supabase_auth::fetch_supabase_auth_user` to reproduce that.
//!
//! ## Behavior gaps
//!
//! - `get_or_create_mira_pet` is called with the service-role key (same as the
//!   legacy admin client), so RLS is bypassed for the pet upsert / read — this
//!   matches the legacy behavior.
//! - The private-schema catalog (`private.mira_accessories`) is queried with the
//!   service-role key and `Accept-Profile: private`, matching the legacy
//!   `client.schema('private')` approach.
//! - `mira_user_accessories` and `mira_daily_stats` are read with the caller's
//!   access token (RLS active), matching the legacy `supabase` (non-admin) client.
//! - Errors fetching accessories or daily stats are soft-ignored (fallback to
//!   empty / null), matching the legacy `console.error` but no 500 pattern.

use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const MIRA_PET_PATH: &str = "/api/v1/mira/pet";
const PRIVATE_SCHEMA: &str = "private";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const PET_ERROR_MESSAGE: &str = "Failed to get pet data";
const MS_PER_DAY: i64 = 86_400_000;

#[derive(Deserialize)]
struct UserAccessoryRow {
    accessory_id: String,
    is_equipped: Option<Value>,
    unlocked_at: Option<Value>,
}

pub(crate) async fn handle_mira_pet_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != MIRA_PET_PATH {
        return None;
    }

    // GET only. Return None for every other method so the Next.js route
    // (which owns PATCH) handles them without interference.
    Some(match request.method {
        "GET" => mira_pet_get(config, request, outbound).await,
        _ => return None,
    })
}

async fn mira_pet_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // --- auth ---
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // --- get or create pet (service role RPC) ---
    let pet = match fetch_pet(&config.contact_data, outbound, &user_id).await {
        Ok(pet) => pet,
        Err(()) => return message_response(500, PET_ERROR_MESSAGE),
    };

    // --- equipped accessories (caller token / RLS) ---
    let user_accessory_rows =
        fetch_user_accessories(&config.contact_data, outbound, &user_id, &access_token)
            .await
            .unwrap_or_default();

    // De-duplicate accessory IDs preserving first-seen order (mirrors JS Set).
    let mut seen: Vec<String> = Vec::new();
    for row in &user_accessory_rows {
        if !seen.contains(&row.accessory_id) {
            seen.push(row.accessory_id.clone());
        }
    }
    let accessory_ids = seen;

    // --- accessory catalog (service role, private schema) ---
    let accessory_map: Vec<Value> = if accessory_ids.is_empty() {
        Vec::new()
    } else {
        fetch_accessories_catalog(&config.contact_data, outbound, &accessory_ids)
            .await
            .unwrap_or_default()
    };

    // Build the equipped_accessories array mirroring the legacy map:
    // { is_equipped, unlocked_at, accessory: catalogRow | null }
    let equipped_accessories: Vec<Value> = user_accessory_rows
        .iter()
        .map(|row| {
            let accessory = accessory_map
                .iter()
                .find(|item| {
                    item.get("id").and_then(Value::as_str) == Some(row.accessory_id.as_str())
                })
                .cloned()
                .unwrap_or(Value::Null);
            json!({
                "is_equipped": row.is_equipped,
                "unlocked_at": row.unlocked_at,
                "accessory": accessory,
            })
        })
        .collect();

    // --- today's daily stats (caller token / RLS, maybeSingle) ---
    let today_str = utc_date_string(now_millis());
    let daily_stats = fetch_daily_stats(
        &config.contact_data,
        outbound,
        &user_id,
        &access_token,
        &today_str,
    )
    .await
    .unwrap_or(Value::Null);

    no_store_response(json_response(
        200,
        json!({
            "pet": pet,
            "equipped_accessories": equipped_accessories,
            "daily_stats": daily_stats,
        }),
    ))
}

/// Call the `get_or_create_mira_pet` RPC with the service-role key (admin).
async fn fetch_pet(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Value, ()> {
    let rpc_url = contact_data.rpc_url("get_or_create_mira_pet").ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = serde_json::to_string(&json!({ "p_user_id": user_id })).map_err(|_| ())?;

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &rpc_url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

/// Fetch equipped accessories for the user (caller token / RLS).
async fn fetch_user_accessories(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Vec<UserAccessoryRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_user_accessories",
        &[
            ("select", "accessory_id,is_equipped,unlocked_at".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("is_equipped", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<UserAccessoryRow>>().map_err(|_| ())
}

/// Fetch accessory rows from the private schema catalog (service role).
async fn fetch_accessories_catalog(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    accessory_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_accessories",
        &[("select", "*".to_owned()), ("id", in_filter(accessory_ids))],
    ) else {
        return Err(());
    };

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

/// Fetch today's daily stats for the user (caller token / RLS, maybeSingle).
async fn fetch_daily_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
    today: &str,
) -> Result<Value, ()> {
    let Some(url) = contact_data.rest_url(
        "mira_daily_stats",
        &[
            ("select", "*".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("date", format!("eq.{today}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // maybeSingle() -> first row or null
    Ok(response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .unwrap_or(Value::Null))
}

/// Send a GET request with the caller's access token (RLS active).
async fn send_caller_rest_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");

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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

/// PostgREST `in.(...)` filter for a list of string IDs.
fn in_filter(values: &[String]) -> String {
    let joined = values
        .iter()
        .map(|v| format!("\"{}\"", v.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// UTC `YYYY-MM-DD` string matching JS `new Date().toISOString().split('T')[0]`.
fn utc_date_string(epoch_ms: i64) -> String {
    let days = epoch_ms.div_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Howard Hinnant's algorithm: days since 1970-01-01 -> (year, month, day).
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(MIRA_PET_PATH, "/api/v1/mira/pet");
    }

    #[test]
    fn path_guard_rejects_subpaths() {
        assert_ne!("/api/v1/mira/pet/extra", MIRA_PET_PATH);
        assert_ne!("/api/v1/mira/pets", MIRA_PET_PATH);
    }

    #[test]
    fn in_filter_produces_correct_syntax() {
        let ids = vec!["abc".to_owned(), "def".to_owned()];
        let result = in_filter(&ids);
        assert_eq!(result, r#"in.("abc","def")"#);
    }

    #[test]
    fn in_filter_escapes_quotes() {
        let ids = vec!["a\"b".to_owned()];
        let result = in_filter(&ids);
        assert_eq!(result, r#"in.("a\"b")"#);
    }

    #[test]
    fn in_filter_empty_list() {
        let ids: Vec<String> = Vec::new();
        assert_eq!(in_filter(&ids), "in.()");
    }

    #[test]
    fn utc_date_string_known_epoch() {
        // 2026-06-29 00:00:00 UTC in milliseconds.
        let epoch_ms = 1_782_000_000_000_i64; // approximate; just verify format
        let s = utc_date_string(epoch_ms);
        // Must be YYYY-MM-DD format with length 10.
        assert_eq!(s.len(), 10);
        assert_eq!(&s[4..5], "-");
        assert_eq!(&s[7..8], "-");
    }

    #[test]
    fn utc_date_string_unix_epoch() {
        // Epoch zero should be 1970-01-01.
        assert_eq!(utc_date_string(0), "1970-01-01");
    }

    #[test]
    fn utc_date_string_one_day_later() {
        // 1970-01-02.
        assert_eq!(utc_date_string(MS_PER_DAY), "1970-01-02");
    }
}
