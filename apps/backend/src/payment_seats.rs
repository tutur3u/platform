//! Handler for `GET /api/payment/seats`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/payment/seats/route.ts`.
//!
//! Auth: the caller must supply a valid Supabase browser session. The handler
//! resolves the authenticated user via the Supabase Auth `/user` endpoint,
//! then checks workspace membership using the service-role key. The legacy
//! route uses `createClient()` (RLS-aware) for the membership check and
//! `createAdminClient()` (service-role) for all data reads; this handler uses
//! the service-role key for both so no RLS context is required.
//!
//! Data reads (all service-role / admin, bypassing RLS):
//!
//! - `workspace_subscriptions` — most-recent row with status in
//!   `(active, trialing, past_due)`.
//! - `workspace_members` — exact count for the workspace.
//! - `private.workspace_subscription_products` — `pricing_model` and
//!   `price_per_seat` columns for the subscription's product.
//!
//! JSON response shape on success (`200`):
//!
//! ```json
//! {
//!   "isSeatBased": bool,
//!   "seatCount": i64,
//!   "memberCount": i64,
//!   "availableSeats": i64,
//!   "canAddMember": bool,
//!   "pricePerSeat": number | null
//! }
//! ```
//!
//! `seatCount` and `availableSeats` are `-1` when the workspace is not
//! seat-based (the legacy route uses `-1` explicitly because `Infinity`
//! serialises to `null` in JSON).
//!
//! Status codes:
//!
//! - `400` — missing `wsId` query param.
//! - `401` — no valid Supabase session or user resolution failed.
//! - `403` — authenticated user is not a member of the workspace.
//! - `500` — configuration or upstream read failure.
//! - `200` — success with the seat-status payload.
//!
//! POST and all other methods return `None` so the request falls through to
//! the still-live Next.js route handler.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse,
    contact::ContactDataConfig,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PAYMENT_SEATS_PATH: &str = "/api/payment/seats";
const PRIVATE_SCHEMA: &str = "private";
const SEAT_ACTIVE_STATUSES: &[&str] = &["active", "trialing", "past_due"];

// ---------------------------------------------------------------------------
// Deserialization helpers
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[allow(dead_code)]
struct WorkspaceMemberRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    seat_count: Option<i64>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionProductRow {
    pricing_model: Option<String>,
    price_per_seat: Option<Value>,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_payment_seats_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != PAYMENT_SEATS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => payment_seats_get(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn payment_seats_get(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return error_response(500, "Failed to get seat status");
    }

    // Extract wsId query param.
    let Some(ws_id) = query_ws_id(request.url) else {
        return error_response(400, "Missing wsId parameter");
    };

    // Authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, "Unauthorized");
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, "Unauthorized");
    };

    // Verify workspace membership.
    match fetch_membership_type(contact_data, outbound, &ws_id, &user_id).await {
        Ok(Some(_)) => {} // any membership type is sufficient
        Ok(None) => return error_response(403, "Not a member of this workspace"),
        Err(()) => return error_response(500, "Failed to verify workspace access"),
    }

    // Fetch the most-recent active subscription.
    let subscription = match fetch_active_subscription(contact_data, outbound, &ws_id).await {
        Ok(value) => value,
        Err(()) => return error_response(500, "Failed to get seat status"),
    };

    // Count workspace members.
    let member_count = match count_workspace_members(contact_data, outbound, &ws_id).await {
        Ok(n) => n,
        Err(()) => return error_response(500, "Failed to get seat status"),
    };

    // Optionally fetch the subscription product from the private schema.
    let product: Option<WorkspaceSubscriptionProductRow> =
        match subscription.as_ref().and_then(|s| s.product_id.as_deref()) {
            Some(product_id) if !product_id.trim().is_empty() => {
                match fetch_subscription_product(contact_data, outbound, product_id).await {
                    Ok(value) => value,
                    Err(()) => return error_response(500, "Failed to get seat status"),
                }
            }
            _ => None,
        };

    let is_seat_based =
        product.as_ref().and_then(|p| p.pricing_model.as_deref()) == Some("seat_based");
    let seat_count: i64 = if is_seat_based {
        subscription
            .as_ref()
            .and_then(|s| s.seat_count)
            .unwrap_or(1)
    } else {
        -1
    };
    let available_seats: i64 = if is_seat_based {
        (seat_count - member_count).max(0)
    } else {
        -1
    };
    let can_add_member = !is_seat_based || available_seats > 0;
    let price_per_seat: Value = product
        .and_then(|p| p.price_per_seat)
        .unwrap_or(Value::Null);

    no_store_response(json_response(
        200,
        json!({
            "isSeatBased": is_seat_based,
            "seatCount": seat_count,
            "memberCount": member_count,
            "availableSeats": available_seats,
            "canAddMember": can_add_member,
            "pricePerSeat": price_per_seat,
        }),
    ))
}

// ---------------------------------------------------------------------------
// Data-access helpers
// ---------------------------------------------------------------------------

/// Returns the membership row for the user in the workspace, or `Ok(None)` if
/// they are not a member.
async fn fetch_membership_type(
    contact_data: &ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<WorkspaceMemberRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "type".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMemberRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

/// Returns the most-recent active subscription for the workspace, or
/// `Ok(None)` if none exists.
async fn fetch_active_subscription(
    contact_data: &ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<WorkspaceSubscriptionRow>, ()> {
    let status_filter = format!("in.({})", SEAT_ACTIVE_STATUSES.join(","));
    let url = contact_data
        .rest_url(
            "workspace_subscriptions",
            &[
                ("select", "seat_count,product_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("status", status_filter),
                ("order", "created_at.desc".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSubscriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

/// Counts workspace members using PostgREST's `Prefer: count=exact` pattern.
async fn count_workspace_members(
    contact_data: &ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<i64, ()> {
    let url = contact_data
        .rest_url(
            "workspace_members",
            &[
                ("select", "ws_id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "count=exact")
                .with_header("Range-Unit", "items")
                .with_header("Range", "0-0"),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    // Parse total from Content-Range: `0-0/<total>` or `*/<total>`.
    if let Some(content_range) = response.header("content-range")
        && let Some(total) = content_range.rsplit('/').next()
        && let Ok(parsed) = total.trim().parse::<i64>()
    {
        return Ok(parsed);
    }

    // Fallback: count returned rows (when Range cap was not applied).
    Ok(response
        .json::<Vec<Value>>()
        .map(|rows| rows.len() as i64)
        .unwrap_or(0))
}

/// Fetches `pricing_model` and `price_per_seat` from the private schema
/// `workspace_subscription_products` table.
async fn fetch_subscription_product(
    contact_data: &ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_id: &str,
) -> Result<Option<WorkspaceSubscriptionProductRow>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_subscription_products",
            &[
                ("select", "pricing_model,price_per_seat".to_owned()),
                ("id", format!("eq.{product_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response =
        send_service_role_get(contact_data, outbound, &url, Some(PRIVATE_SCHEMA)).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSubscriptionProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

// ---------------------------------------------------------------------------
// Shared outbound helper
// ---------------------------------------------------------------------------

async fn send_service_role_get(
    contact_data: &ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema_profile: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(profile) = schema_profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    outbound.send(request).await.map_err(|_| ())
}

// ---------------------------------------------------------------------------
// URL / response helpers
// ---------------------------------------------------------------------------

/// Extracts the `wsId` query parameter from the request URL.
fn query_ws_id(request_url: Option<&str>) -> Option<String> {
    url::Url::parse(request_url?)
        .ok()?
        .query_pairs()
        .find_map(|(key, value)| (key == "wsId" && !value.is_empty()).then(|| value.into_owned()))
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- query_ws_id -------------------------------------------------------

    #[test]
    fn query_ws_id_returns_none_when_url_is_none() {
        assert_eq!(query_ws_id(None), None);
    }

    #[test]
    fn query_ws_id_returns_none_when_param_missing() {
        assert_eq!(
            query_ws_id(Some("https://example.com/api/payment/seats")),
            None
        );
    }

    #[test]
    fn query_ws_id_returns_none_when_param_empty() {
        assert_eq!(
            query_ws_id(Some("https://example.com/api/payment/seats?wsId=")),
            None
        );
    }

    #[test]
    fn query_ws_id_returns_value_when_present() {
        assert_eq!(
            query_ws_id(Some("https://example.com/api/payment/seats?wsId=abc-123")),
            Some("abc-123".to_owned())
        );
    }

    #[test]
    fn query_ws_id_ignores_other_params() {
        assert_eq!(
            query_ws_id(Some(
                "https://example.com/api/payment/seats?foo=bar&wsId=ws-42&baz=1"
            )),
            Some("ws-42".to_owned())
        );
    }

    // ---- path guard --------------------------------------------------------

    #[test]
    fn payment_seats_path_constant_matches_expected() {
        assert_eq!(PAYMENT_SEATS_PATH, "/api/payment/seats");
    }

    #[test]
    fn path_guard_rejects_unrelated_paths() {
        // Simulate the path guard in handle_payment_seats_route.
        let paths = [
            "/api/payment/seats/extra",
            "/api/payment/seat",
            "/api/v1/payment/seats",
            "/",
            "",
        ];
        for path in paths {
            assert!(path != PAYMENT_SEATS_PATH, "path {path} should not match");
        }
    }

    #[test]
    fn path_guard_matches_exact_path() {
        assert_eq!("/api/payment/seats", PAYMENT_SEATS_PATH);
    }

    // ---- seat_active_statuses ----------------------------------------------

    #[test]
    fn seat_active_statuses_contains_expected_values() {
        assert!(SEAT_ACTIVE_STATUSES.contains(&"active"));
        assert!(SEAT_ACTIVE_STATUSES.contains(&"trialing"));
        assert!(SEAT_ACTIVE_STATUSES.contains(&"past_due"));
        assert_eq!(SEAT_ACTIVE_STATUSES.len(), 3);
    }

    // ---- status filter string ----------------------------------------------

    #[test]
    fn status_filter_format_matches_postgrest_in_syntax() {
        let filter = format!("in.({})", SEAT_ACTIVE_STATUSES.join(","));
        assert_eq!(filter, "in.(active,trialing,past_due)");
    }
}
