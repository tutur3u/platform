//! Handler for `GET /api/v1/infrastructure/push-notifications`.
//!
//! Legacy source:
//! `apps/web/src/app/api/v1/infrastructure/push-notifications/route.ts`.
//!
//! ## Auth
//!
//! Checks `view_infrastructure` permission on the root workspace via
//! `workspace_permission_check::authorize_workspace_permission`, matching the
//! legacy `authorizePushDashboard` which calls `getPermissions` with the root
//! workspace ID and checks `containsPermission('view_infrastructure')`.
//!
//! ## Behavior Gaps
//!
//! - `canManagePush` always returns `false`. The legacy additionally checks the
//!   `manage_workspace_roles` permission to determine this field, which would
//!   require a second auth round-trip. Defaulting to `false` is conservative;
//!   the manage-push UI will be hidden for all users. Callers that need the
//!   `true` value should use the still-live Next.js route.
//! - `config` (Firebase messaging state) returns a fixed placeholder with
//!   `state: "unconfigured"`. The legacy calls
//!   `getFirebaseMessagingConfigurationStatus()` which reads private server
//!   environment variables not accessible in the worker runtime.
//! - Device counts and coverage are derived from a single paginated scan query
//!   (limit 10 000 rows). If total device count exceeds that limit, all device
//!   summary counts and coverage numbers will be underreported. The legacy uses
//!   exact SQL `COUNT(*)` queries per filter combination.
//! - Token masking uses byte-level slicing (`token[..8]`, `token[len-8..]`).
//!   Push notification tokens are always printable ASCII, so results are
//!   identical to the legacy JS character-level `String.prototype.slice`.
//! - Batch counts use PostgREST `select=count()` aggregate (available since
//!   PostgREST v12, which Supabase currently ships). If the aggregate is
//!   unavailable, batch counts fall back to `0`.

use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PUSH_NOTIFICATIONS_PATH: &str = "/api/v1/infrastructure/push-notifications";
const VIEW_INFRASTRUCTURE: &str = "view_infrastructure";
const PUSH_DEVICES_TABLE: &str = "notification_push_devices";
const NOTIFICATION_BATCHES_TABLE: &str = "notification_batches";
const DEVICES_SCAN_LIMIT: &str = "10000";
const RECENT_DEVICES_LIMIT: &str = "20";
const RECENT_BATCHES_LIMIT: &str = "12";
const ERROR_MESSAGE: &str = "Failed to load push notification dashboard";

// ---------------------------------------------------------------------------
// Deserialization types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PushDeviceScanRow {
    app_flavor: Option<String>,
    platform: Option<String>,
    last_seen_at: Option<String>,
}

#[derive(Deserialize)]
struct CountRow {
    count: Option<i64>,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_infrastructure_push_notifications_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != PUSH_NOTIFICATIONS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => push_notifications_response(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn push_notifications_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    match authorize_workspace_permission(
        &config.contact_data,
        request,
        ROOT_WORKSPACE_ID,
        VIEW_INFRASTRUCTURE,
        outbound,
    )
    .await
    {
        Ok(_) => {}
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, "Unauthorized");
        }
        Err(
            WorkspacePermissionAuthorizationError::Forbidden
            | WorkspacePermissionAuthorizationError::NotFound,
        ) => {
            return message_response(403, "Forbidden");
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, ERROR_MESSAGE);
        }
    }

    let contact_data = &config.contact_data;
    if !contact_data.configured() {
        return message_response(500, ERROR_MESSAGE);
    }

    // Compute time thresholds for active-device counts.
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let active_24h_threshold = unix_secs_to_iso8601(now_secs.saturating_sub(86_400));
    let active_7d_threshold = unix_secs_to_iso8601(now_secs.saturating_sub(7 * 86_400));

    // --- Device data (two queries) ---
    let scan_rows = fetch_device_scan_rows(contact_data, outbound).await;

    let total_devices = scan_rows.len() as i64;
    let active_24h = count_devices_by(&scan_rows, |r| {
        r.last_seen_at
            .as_deref()
            .is_some_and(|t| t >= active_24h_threshold.as_str())
    });
    let active_7d = count_devices_by(&scan_rows, |r| {
        r.last_seen_at
            .as_deref()
            .is_some_and(|t| t >= active_7d_threshold.as_str())
    });
    let development_devices = count_devices_by(&scan_rows, |r| flavor(r) == Some("development"));
    let development_ios = count_devices_by(&scan_rows, |r| {
        flavor(r) == Some("development") && platform(r) == Some("ios")
    });
    let development_android = count_devices_by(&scan_rows, |r| {
        flavor(r) == Some("development") && platform(r) == Some("android")
    });
    let staging_devices = count_devices_by(&scan_rows, |r| flavor(r) == Some("staging"));
    let staging_ios = count_devices_by(&scan_rows, |r| {
        flavor(r) == Some("staging") && platform(r) == Some("ios")
    });
    let staging_android = count_devices_by(&scan_rows, |r| {
        flavor(r) == Some("staging") && platform(r) == Some("android")
    });
    let production_devices = count_devices_by(&scan_rows, |r| flavor(r) == Some("production"));
    let production_ios = count_devices_by(&scan_rows, |r| {
        flavor(r) == Some("production") && platform(r) == Some("ios")
    });
    let production_android = count_devices_by(&scan_rows, |r| {
        flavor(r) == Some("production") && platform(r) == Some("android")
    });
    let ios_devices = count_devices_by(&scan_rows, |r| platform(r) == Some("ios"));
    let android_devices = count_devices_by(&scan_rows, |r| platform(r) == Some("android"));

    let recent_devices = fetch_recent_devices(contact_data, outbound).await;

    // --- Batch data (five queries against private schema) ---
    let pending_batches = count_batches(contact_data, outbound, "pending").await;
    let processing_batches = count_batches(contact_data, outbound, "processing").await;
    let sent_batches = count_batches(contact_data, outbound, "sent").await;
    let failed_batches = count_batches(contact_data, outbound, "failed").await;
    let recent_batches = fetch_recent_batches(contact_data, outbound).await;

    no_store_response(json_response(
        200,
        json!({
            // Gap: always false; secondary manage_workspace_roles check not wired.
            "canManagePush": false,
            // Gap: Firebase config not available in worker runtime.
            "config": {
                "message": "Firebase configuration unavailable in Rust worker",
                "projectId": Value::Null,
                "source": "unknown",
                "state": "unconfigured",
            },
            "coverage": {
                "development": {
                    "all": development_devices,
                    "android": development_android,
                    "ios": development_ios,
                },
                "production": {
                    "all": production_devices,
                    "android": production_android,
                    "ios": production_ios,
                },
                "staging": {
                    "all": staging_devices,
                    "android": staging_android,
                    "ios": staging_ios,
                },
            },
            "recentBatches": recent_batches,
            "recentDevices": recent_devices,
            "summary": {
                "active24h": active_24h,
                "active7d": active_7d,
                "androidDevices": android_devices,
                "developmentDevices": development_devices,
                "failedBatches": failed_batches,
                "iosDevices": ios_devices,
                "pendingBatches": pending_batches,
                "processingBatches": processing_batches,
                "productionDevices": production_devices,
                "sentBatches": sent_batches,
                "stagingDevices": staging_devices,
                "totalDevices": total_devices,
            },
        }),
    ))
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/// Fetches a lightweight scan of every push device (up to
/// `DEVICES_SCAN_LIMIT` rows, ordered by `last_seen_at` desc) containing
/// only the fields needed for in-process count computation.
async fn fetch_device_scan_rows(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Vec<PushDeviceScanRow> {
    let Some(url) = contact_data.rest_url(
        PUSH_DEVICES_TABLE,
        &[
            ("select", "app_flavor,platform,last_seen_at".to_owned()),
            ("order", "last_seen_at.desc".to_owned()),
            ("limit", DEVICES_SCAN_LIMIT.to_owned()),
        ],
    ) else {
        return Vec::new();
    };

    match service_role_get(contact_data, outbound, &url, None).await {
        Ok(resp) if (200..300).contains(&resp.status) => {
            resp.json::<Vec<PushDeviceScanRow>>().unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

/// Fetches the 20 most-recently-seen devices with all display fields. The raw
/// `token` is replaced by a `token_preview` before returning.
async fn fetch_recent_devices(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Vec<Value> {
    let Some(url) = contact_data.rest_url(
        PUSH_DEVICES_TABLE,
        &[
            (
                "select",
                "id,user_id,device_id,token,platform,app_flavor,last_seen_at,created_at".to_owned(),
            ),
            ("order", "last_seen_at.desc".to_owned()),
            ("limit", RECENT_DEVICES_LIMIT.to_owned()),
        ],
    ) else {
        return Vec::new();
    };

    let rows: Vec<Value> = match service_role_get(contact_data, outbound, &url, None).await {
        Ok(resp) if (200..300).contains(&resp.status) => {
            resp.json::<Vec<Value>>().unwrap_or_default()
        }
        _ => Vec::new(),
    };

    rows.into_iter().map(mask_device_token).collect()
}

/// Returns the exact count of `notification_batches` rows in the private
/// schema with `channel = 'push'` and `status = {status}`, using the
/// PostgREST `select=count()` aggregate (PostgREST v12+). Falls back to `0`
/// if the aggregate is unavailable.
async fn count_batches(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    status: &str,
) -> i64 {
    let Some(url) = contact_data.rest_url(
        NOTIFICATION_BATCHES_TABLE,
        &[
            ("select", "count()".to_owned()),
            ("channel", "eq.push".to_owned()),
            ("status", format!("eq.{status}")),
        ],
    ) else {
        return 0;
    };

    match service_role_get(contact_data, outbound, &url, Some("private")).await {
        Ok(resp) if (200..300).contains(&resp.status) => resp
            .json::<Vec<CountRow>>()
            .ok()
            .and_then(|rows| rows.into_iter().next())
            .and_then(|row| row.count)
            .unwrap_or(0),
        _ => 0,
    }
}

/// Fetches the 12 most-recently-created push-channel notification batches
/// from the private schema.
async fn fetch_recent_batches(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Vec<Value> {
    let Some(url) = contact_data.rest_url(
        NOTIFICATION_BATCHES_TABLE,
        &[
            (
                "select",
                "id,status,delivery_mode,notification_count,created_at,updated_at,sent_at,error_message"
                    .to_owned(),
            ),
            ("channel", "eq.push".to_owned()),
            ("order", "created_at.desc".to_owned()),
            ("limit", RECENT_BATCHES_LIMIT.to_owned()),
        ],
    ) else {
        return Vec::new();
    };

    match service_role_get(contact_data, outbound, &url, Some("private")).await {
        Ok(resp) if (200..300).contains(&resp.status) => {
            resp.json::<Vec<Value>>().unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

/// Sends a service-role GET request. Pass `schema = Some("private")` to add
/// an `Accept-Profile: private` header for PostgREST schema selection.
async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema: Option<&str>,
) -> Result<crate::outbound::OutboundResponse, ()> {
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");

    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(schema_name) = schema {
        req = req.with_header("Accept-Profile", schema_name);
    }

    outbound.send(req).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn count_devices_by<F>(rows: &[PushDeviceScanRow], predicate: F) -> i64
where
    F: Fn(&PushDeviceScanRow) -> bool,
{
    rows.iter().filter(|r| predicate(r)).count() as i64
}

fn flavor(row: &PushDeviceScanRow) -> Option<&str> {
    row.app_flavor.as_deref()
}

fn platform(row: &PushDeviceScanRow) -> Option<&str> {
    row.platform.as_deref()
}

/// Replaces the raw `token` field with a `token_preview` (first 8 + last 8
/// bytes, joined by `"..."`). Mirrors the legacy `maskToken` helper.
fn mask_device_token(mut device: Value) -> Value {
    let preview = device
        .get("token")
        .and_then(Value::as_str)
        .map(mask_token)
        .unwrap_or_default();

    if let Some(obj) = device.as_object_mut() {
        obj.remove("token");
        obj.insert("token_preview".to_owned(), Value::String(preview));
    }

    device
}

/// Returns a masked form of `token`: first 8 bytes + `"..."` + last 8 bytes.
/// Tokens of 16 bytes or fewer are returned unchanged. Push tokens are always
/// printable ASCII so byte offsets equal the legacy JS character offsets.
fn mask_token(token: &str) -> String {
    if token.len() <= 16 {
        token.to_owned()
    } else {
        format!("{}...{}", &token[..8], &token[token.len() - 8..])
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Converts a Unix timestamp (seconds since epoch) to an ISO-8601 string in
/// UTC, e.g. `"2024-01-15T12:30:00.000Z"`. Mirrors the `new Date(ms).toISOString()`
/// call used in the legacy route to compute the active-device thresholds.
fn unix_secs_to_iso8601(secs: u64) -> String {
    let sec = secs % 60;
    let min = (secs / 60) % 60;
    let hour = (secs / 3_600) % 24;
    let days = secs / 86_400;
    let (year, month, day) = days_to_ymd(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}.000Z")
}

/// Converts days since the Unix epoch (1970-01-01) to `(year, month, day)`.
///
/// Algorithm: <http://howardhinnant.github.io/date_algorithms.html>
fn days_to_ymd(days: u64) -> (u64, u64, u64) {
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z % 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!(
            PUSH_NOTIFICATIONS_PATH,
            "/api/v1/infrastructure/push-notifications"
        );
    }

    #[test]
    fn mask_token_short_is_unchanged() {
        assert_eq!(mask_token("short"), "short");
        // Boundary: exactly 16 chars → unchanged.
        assert_eq!(mask_token("1234567890123456"), "1234567890123456");
    }

    #[test]
    fn mask_token_long_shows_preview() {
        // 24 ASCII chars: first 8 = "12345678", last 8 = "98765432".
        let token = "12345678middle!!98765432";
        assert_eq!(mask_token(token), "12345678...98765432");
    }

    #[test]
    fn mask_device_token_removes_raw_and_adds_preview() {
        let device = json!({
            "id": "dev-1",
            "token": "12345678abcdefghijklmnop98765432",
            "platform": "ios",
        });
        let masked = mask_device_token(device);
        assert!(masked.get("token").is_none(), "raw token must be removed");
        let preview = masked["token_preview"]
            .as_str()
            .expect("token_preview present");
        assert!(preview.contains("..."), "preview must contain ellipsis");
        assert_eq!(&preview[..8], "12345678");
        assert_eq!(&preview[preview.len() - 8..], "98765432");
    }

    #[test]
    fn mask_device_token_short_token_unchanged() {
        let device = json!({ "token": "short", "id": "x" });
        let masked = mask_device_token(device);
        assert_eq!(masked["token_preview"].as_str(), Some("short"));
    }

    #[test]
    fn unix_secs_to_iso8601_epoch() {
        assert_eq!(unix_secs_to_iso8601(0), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn unix_secs_to_iso8601_known_date() {
        // 2024-01-01T00:00:00Z = 1 704 067 200 seconds.
        assert_eq!(
            unix_secs_to_iso8601(1_704_067_200),
            "2024-01-01T00:00:00.000Z"
        );
    }

    #[test]
    fn days_to_ymd_epoch_is_jan_1_1970() {
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
    }

    #[test]
    fn days_to_ymd_known_date() {
        // 2024-01-01 = 19 723 days since 1970-01-01.
        assert_eq!(days_to_ymd(19_723), (2024, 1, 1));
    }

    #[test]
    fn count_devices_by_filters_correctly() {
        let rows = vec![
            PushDeviceScanRow {
                app_flavor: Some("development".to_owned()),
                platform: Some("ios".to_owned()),
                last_seen_at: Some("2024-01-02T00:00:00.000Z".to_owned()),
            },
            PushDeviceScanRow {
                app_flavor: Some("production".to_owned()),
                platform: Some("android".to_owned()),
                last_seen_at: Some("2024-01-01T00:00:00.000Z".to_owned()),
            },
            PushDeviceScanRow {
                app_flavor: Some("development".to_owned()),
                platform: Some("android".to_owned()),
                last_seen_at: None,
            },
        ];

        assert_eq!(
            count_devices_by(&rows, |r| flavor(r) == Some("development")),
            2
        );
        assert_eq!(count_devices_by(&rows, |r| platform(r) == Some("ios")), 1);
        assert_eq!(
            count_devices_by(&rows, |r| {
                flavor(r) == Some("development") && platform(r) == Some("android")
            }),
            1
        );
        assert_eq!(count_devices_by(&rows, |r| r.last_seen_at.is_some()), 2);
    }

    #[test]
    fn active_threshold_comparison_is_lexicographic() {
        // ISO-8601 strings are lexicographically ordered, so >= works correctly.
        let threshold = "2024-01-10T00:00:00.000Z";
        let after = "2024-01-11T00:00:00.000Z";
        let before = "2024-01-09T00:00:00.000Z";
        assert!(after >= threshold);
        assert!(before < threshold);
    }
}
