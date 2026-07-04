//! Handler for `GET /api/v1/admin/ai-credits/allocations`.
//!
//! Ports the legacy Next.js route at
//! `apps/web/src/app/api/v1/admin/ai-credits/allocations/route.ts`.
//!
//! ## Auth
//!
//! Requires a valid Supabase session token belonging to a `MEMBER` of the root
//! workspace, matching `requireRootAdmin()` in the legacy route.
//!
//! ## GET behaviour
//!
//! Reads all rows from `ai_credit_plan_allocations` (service-role, ordered by
//! `tier`) and fills in `default_image_model` / `default_language_model` with
//! per-tier fallback values when the DB columns are `null`, matching the legacy
//! `getPlanDefaults` logic exactly.
//!
//! ## Gaps vs legacy
//!
//! - `PUT` is not ported; this handler returns `None` for non-GET methods so
//!   the still-live Next.js route handles them.
//! - The `method_not_allowed` helper is intentionally **not** called for
//!   non-GET methods; returning `None` lets the worker fall through.

use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    infrastructure_root_auth::ROOT_WORKSPACE_ID,
    json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const ALLOCATIONS_PATH: &str = "/api/v1/admin/ai-credits/allocations";
const AI_CREDIT_PLAN_ALLOCATIONS_TABLE: &str = "ai_credit_plan_allocations";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const ROOT_ADMIN_REQUIRED_MESSAGE: &str = "Root workspace admin required";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch allocations";

// ---------------------------------------------------------------------------
// Plan-tier default models — mirrors PLAN_DEFAULT_MODELS in the legacy route.
// ---------------------------------------------------------------------------

/// Returns `(default_image_model, default_language_model)` for a tier string.
///
/// Tiers not in the explicit list fall back to `FREE` defaults, exactly as the
/// legacy `getPlanDefaults` function does.
fn get_plan_defaults(tier: &str) -> (&'static str, &'static str) {
    match tier {
        "ENTERPRISE" | "PLUS" | "PRO" => (
            "google/imagen-4.0-generate-001",
            "google/gemini-3.1-flash-lite",
        ),
        // FREE and any unknown tier
        _ => (
            "google/imagen-4.0-fast-generate-001",
            "google/gemini-3.1-flash-lite",
        ),
    }
}

// ---------------------------------------------------------------------------
// Membership check helpers (mirrors verify_root_workspace_member in overview)
// ---------------------------------------------------------------------------

use serde::Deserialize;

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

enum MembershipOutcome {
    Member,
    Forbidden,
    LookupFailed,
}

async fn verify_root_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    access_token: &str,
    user_id: &str,
) -> MembershipOutcome {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return MembershipOutcome::LookupFailed;
    };

    let Some(service_role_key) = contact_data.service_role_key() else {
        return MembershipOutcome::LookupFailed;
    };
    let authorization = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    if !(200..300).contains(&response.status) {
        return MembershipOutcome::LookupFailed;
    }

    let rows = match response.json::<Vec<WorkspaceMembershipRow>>() {
        Ok(rows) => rows,
        Err(_) => return MembershipOutcome::LookupFailed,
    };

    let is_member = rows.first().and_then(|row| row.membership_type.as_deref()) == Some("MEMBER");

    if is_member {
        MembershipOutcome::Member
    } else {
        MembershipOutcome::Forbidden
    }
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_admin_ai_credits_allocations_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    if request.path != ALLOCATIONS_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => allocations_get_response(config, request, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn allocations_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // --- Auth: require a valid session token ---
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_message(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_message(401, UNAUTHORIZED_MESSAGE);
    };

    // --- Auth: require root workspace MEMBER ---
    match verify_root_workspace_member(contact_data, outbound, &access_token, &user_id).await {
        MembershipOutcome::Member => {}
        MembershipOutcome::LookupFailed => {
            return error_message(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE);
        }
        MembershipOutcome::Forbidden => {
            return error_message(403, ROOT_ADMIN_REQUIRED_MESSAGE);
        }
    }

    // --- Data: fetch all allocations (service-role, ordered by tier) ---
    match fetch_allocations(contact_data, outbound).await {
        Ok(rows) => no_store_response(json_response(200, Value::Array(rows))),
        Err(()) => error_message(500, FETCH_FAILED_MESSAGE),
    }
}

/// Fetches all rows from `ai_credit_plan_allocations` ordered by `tier` using
/// the service-role key (bypasses RLS, matching the legacy `sbAdmin` call).
///
/// Each row has `default_image_model` and `default_language_model` filled in
/// with per-tier fallback values when the DB columns are `null`.
async fn fetch_allocations(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            AI_CREDIT_PLAN_ALLOCATIONS_TABLE,
            &[("select", "*".to_owned()), ("order", "tier".to_owned())],
        )
        .ok_or(())?;

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<Value> = response.json::<Vec<Value>>().map_err(|_| ())?;

    Ok(rows.into_iter().map(apply_plan_defaults).collect())
}

/// Applies per-tier default model values when `default_image_model` or
/// `default_language_model` are `null` in the row, mirroring the legacy
/// `getPlanDefaults` / spread logic in the GET response mapping.
fn apply_plan_defaults(row: Value) -> Value {
    let Value::Object(mut map) = row else {
        return Value::Object(Map::new());
    };

    let tier = map
        .get("tier")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();

    let (default_image, default_language) = get_plan_defaults(&tier);

    // Fill in null/missing image model
    if matches!(map.get("default_image_model"), None | Some(Value::Null)) {
        map.insert(
            "default_image_model".to_owned(),
            Value::String(default_image.to_owned()),
        );
    }

    // Fill in null/missing language model
    if matches!(map.get("default_language_model"), None | Some(Value::Null)) {
        map.insert(
            "default_language_model".to_owned(),
            Value::String(default_language.to_owned()),
        );
    }

    Value::Object(map)
}

fn error_message(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_plan_defaults_known_tiers() {
        let (img, lang) = get_plan_defaults("ENTERPRISE");
        assert_eq!(img, "google/imagen-4.0-generate-001");
        assert_eq!(lang, "google/gemini-3.1-flash-lite");

        let (img, lang) = get_plan_defaults("PLUS");
        assert_eq!(img, "google/imagen-4.0-generate-001");
        assert_eq!(lang, "google/gemini-3.1-flash-lite");

        let (img, lang) = get_plan_defaults("PRO");
        assert_eq!(img, "google/imagen-4.0-generate-001");
        assert_eq!(lang, "google/gemini-3.1-flash-lite");
    }

    #[test]
    fn test_get_plan_defaults_free_tier() {
        let (img, lang) = get_plan_defaults("FREE");
        assert_eq!(img, "google/imagen-4.0-fast-generate-001");
        assert_eq!(lang, "google/gemini-3.1-flash-lite");
    }

    #[test]
    fn test_get_plan_defaults_unknown_falls_back_to_free() {
        let (img, lang) = get_plan_defaults("UNKNOWN");
        assert_eq!(img, "google/imagen-4.0-fast-generate-001");
        assert_eq!(lang, "google/gemini-3.1-flash-lite");

        let (img2, lang2) = get_plan_defaults("");
        assert_eq!(img2, "google/imagen-4.0-fast-generate-001");
        assert_eq!(lang2, "google/gemini-3.1-flash-lite");
    }

    #[test]
    fn test_apply_plan_defaults_fills_null_models() {
        let row = json!({
            "tier": "FREE",
            "default_image_model": null,
            "default_language_model": null,
            "monthly_credits": 100
        });
        let result = apply_plan_defaults(row);
        assert_eq!(
            result["default_image_model"],
            "google/imagen-4.0-fast-generate-001"
        );
        assert_eq!(
            result["default_language_model"],
            "google/gemini-3.1-flash-lite"
        );
        assert_eq!(result["monthly_credits"], 100);
    }

    #[test]
    fn test_apply_plan_defaults_preserves_existing_models() {
        let row = json!({
            "tier": "PRO",
            "default_image_model": "custom/image-model",
            "default_language_model": "custom/lang-model",
            "monthly_credits": 500
        });
        let result = apply_plan_defaults(row);
        assert_eq!(result["default_image_model"], "custom/image-model");
        assert_eq!(result["default_language_model"], "custom/lang-model");
    }

    #[test]
    fn test_apply_plan_defaults_enterprise_tier() {
        let row = json!({
            "tier": "ENTERPRISE",
            "default_image_model": null,
            "default_language_model": null
        });
        let result = apply_plan_defaults(row);
        assert_eq!(
            result["default_image_model"],
            "google/imagen-4.0-generate-001"
        );
        assert_eq!(
            result["default_language_model"],
            "google/gemini-3.1-flash-lite"
        );
    }

    #[test]
    fn test_path_guard_matches_exact_path() {
        assert_eq!(ALLOCATIONS_PATH, "/api/v1/admin/ai-credits/allocations");
    }

    #[test]
    fn test_apply_plan_defaults_missing_fields_filled() {
        // Row with no model fields at all (missing, not null)
        let row = json!({ "tier": "PLUS", "monthly_credits": 200 });
        let result = apply_plan_defaults(row);
        assert_eq!(
            result["default_image_model"],
            "google/imagen-4.0-generate-001"
        );
        assert_eq!(
            result["default_language_model"],
            "google/gemini-3.1-flash-lite"
        );
        assert_eq!(result["monthly_credits"], 200);
    }

    #[test]
    fn test_internal_error_fallback() {
        // Non-object JSON values are replaced with an empty object
        let row = Value::String("bad".to_owned());
        let result = apply_plan_defaults(row);
        assert!(result.as_object().unwrap().is_empty());
    }
}
