use serde::Serialize;
use serde_json::{Map, Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
};

use super::{
    MOBILE_ANDROID_EFFECTIVE_VERSION, MOBILE_ANDROID_MINIMUM_VERSION, MOBILE_ANDROID_OTP_ENABLED,
    MOBILE_ANDROID_STORE_URL, MOBILE_IOS_EFFECTIVE_VERSION, MOBILE_IOS_MINIMUM_VERSION,
    MOBILE_IOS_OTP_ENABLED, MOBILE_IOS_STORE_URL, MobilePlatformVersionPolicy,
    MobileVersionPolicies, ROOT_WORKSPACE_ID, WEB_OTP_ENABLED, authorize_mobile_version_admin,
    is_success_status, mobile_version_admin_auth_error_response, mobile_version_policies_response,
    validate_mobile_version_policies,
};

const MOBILE_VERSION_POLICIES_SAVE_ERROR: &str = "Failed to save mobile version policies";

#[derive(Serialize)]
struct MobileVersionPolicyUpsertRow {
    id: &'static str,
    updated_at: String,
    value: String,
    ws_id: &'static str,
}

pub(super) async fn infrastructure_mobile_versions_update_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Err(error) = authorize_mobile_version_admin(config, request, outbound).await {
        return mobile_version_admin_auth_error_response(error);
    }

    let policies = match parse_mobile_version_update_body(request.body_text) {
        Ok(policies) => policies,
        Err(errors) => {
            return no_store_response(json_response(
                400,
                json!({ "message": "Invalid request body", "errors": errors }),
            ));
        }
    };

    if let Err(errors) = validate_mobile_version_policies(&policies) {
        return no_store_response(json_response(
            400,
            json!({ "message": "Invalid mobile version policy", "errors": errors }),
        ));
    }

    match upsert_mobile_version_policies(config, outbound, &policies).await {
        Ok(()) => no_store_response(json_response(
            200,
            json!({
                "message": "success",
                "data": mobile_version_policies_response(policies),
            }),
        )),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": MOBILE_VERSION_POLICIES_SAVE_ERROR }),
        )),
    }
}

async fn upsert_mobile_version_policies(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
    policies: &MobileVersionPolicies,
) -> Result<(), ()> {
    if !config.contact_data.configured() {
        return Err(());
    }

    let Some(url) = config.contact_data.rest_url(
        "workspace_configs",
        &[("on_conflict", "ws_id,id".to_owned())],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return Err(());
    };
    let rows = mobile_version_policy_upsert_rows(policies);
    let body = serde_json::to_string(&rows).map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Prefer", "resolution=merge-duplicates,return=minimal")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(())
}

fn parse_mobile_version_update_body(
    body_text: Option<&str>,
) -> Result<MobileVersionPolicies, Vec<Value>> {
    let Some(body_text) = body_text else {
        return Err(vec![mobile_version_body_issue(
            Vec::new(),
            "Invalid input: expected object, received null",
        )]);
    };
    let body = serde_json::from_str::<Value>(body_text).map_err(|_| {
        vec![mobile_version_body_issue(
            Vec::new(),
            "Invalid input: expected object, received invalid JSON",
        )]
    })?;
    let Some(body) = body.as_object() else {
        return Err(vec![mobile_version_body_issue(
            Vec::new(),
            "Invalid input: expected object",
        )]);
    };

    let mut errors = Vec::new();
    let ios = parse_platform_policy_body(body, "ios", &mut errors);
    let android = parse_platform_policy_body(body, "android", &mut errors);
    let web_otp_enabled = optional_bool_field(body, "webOtpEnabled", &mut errors).unwrap_or(false);

    if errors.is_empty() {
        Ok(MobileVersionPolicies {
            ios: ios.unwrap_or_else(empty_mobile_platform_policy),
            android: android.unwrap_or_else(empty_mobile_platform_policy),
            web_otp_enabled,
        })
    } else {
        Err(errors)
    }
}

fn parse_platform_policy_body(
    body: &Map<String, Value>,
    field: &'static str,
    errors: &mut Vec<Value>,
) -> Option<MobilePlatformVersionPolicy> {
    let Some(value) = body.get(field) else {
        errors.push(mobile_version_body_issue(
            vec![field],
            "Invalid input: expected object, received undefined",
        ));
        return None;
    };
    let Some(value) = value.as_object() else {
        errors.push(mobile_version_body_issue(
            vec![field],
            "Invalid input: expected object",
        ));
        return None;
    };

    Some(MobilePlatformVersionPolicy {
        effective_version: optional_string_field(value, field, "effectiveVersion", errors),
        minimum_version: optional_string_field(value, field, "minimumVersion", errors),
        otp_enabled: optional_bool_field(value, "otpEnabled", errors).unwrap_or(false),
        store_url: optional_string_field(value, field, "storeUrl", errors),
    })
}

fn empty_mobile_platform_policy() -> MobilePlatformVersionPolicy {
    MobilePlatformVersionPolicy {
        effective_version: None,
        minimum_version: None,
        otp_enabled: false,
        store_url: None,
    }
}

fn optional_string_field(
    object: &Map<String, Value>,
    parent: &'static str,
    field: &'static str,
    errors: &mut Vec<Value>,
) -> Option<String> {
    let value = object.get(field)?;

    if value.is_null() {
        return None;
    }

    match value {
        Value::String(value) => normalize_optional_string(value),
        _ => {
            errors.push(mobile_version_body_issue(
                vec![parent, field],
                "Invalid input: expected string",
            ));
            None
        }
    }
}

fn optional_bool_field(
    object: &Map<String, Value>,
    field: &'static str,
    errors: &mut Vec<Value>,
) -> Option<bool> {
    let value = object.get(field)?;

    match value {
        Value::Bool(value) => Some(*value),
        _ => {
            errors.push(mobile_version_body_issue(
                vec![field],
                "Invalid input: expected boolean",
            ));
            None
        }
    }
}

fn mobile_version_body_issue(path: Vec<&'static str>, message: &'static str) -> Value {
    json!({
        "code": "invalid_type",
        "message": message,
        "path": path,
    })
}

fn normalize_optional_string(value: &str) -> Option<String> {
    let trimmed = value.trim();

    (!trimmed.is_empty()).then_some(trimmed.to_owned())
}

fn mobile_version_policy_upsert_rows(
    policies: &MobileVersionPolicies,
) -> Vec<MobileVersionPolicyUpsertRow> {
    let updated_at = current_iso_timestamp();
    let mut rows = Vec::with_capacity(9);

    push_platform_policy_rows(
        &mut rows,
        &updated_at,
        &policies.ios,
        MobileVersionPolicyConfigIds {
            effective_version: MOBILE_IOS_EFFECTIVE_VERSION,
            minimum_version: MOBILE_IOS_MINIMUM_VERSION,
            otp_enabled: MOBILE_IOS_OTP_ENABLED,
            store_url: MOBILE_IOS_STORE_URL,
        },
    );
    push_platform_policy_rows(
        &mut rows,
        &updated_at,
        &policies.android,
        MobileVersionPolicyConfigIds {
            effective_version: MOBILE_ANDROID_EFFECTIVE_VERSION,
            minimum_version: MOBILE_ANDROID_MINIMUM_VERSION,
            otp_enabled: MOBILE_ANDROID_OTP_ENABLED,
            store_url: MOBILE_ANDROID_STORE_URL,
        },
    );
    rows.push(MobileVersionPolicyUpsertRow {
        id: WEB_OTP_ENABLED,
        ws_id: ROOT_WORKSPACE_ID,
        value: policies.web_otp_enabled.to_string(),
        updated_at,
    });

    rows
}

struct MobileVersionPolicyConfigIds {
    effective_version: &'static str,
    minimum_version: &'static str,
    otp_enabled: &'static str,
    store_url: &'static str,
}

fn push_platform_policy_rows(
    rows: &mut Vec<MobileVersionPolicyUpsertRow>,
    updated_at: &str,
    policy: &MobilePlatformVersionPolicy,
    config_ids: MobileVersionPolicyConfigIds,
) {
    rows.push(MobileVersionPolicyUpsertRow {
        id: config_ids.effective_version,
        ws_id: ROOT_WORKSPACE_ID,
        value: policy.effective_version.clone().unwrap_or_default(),
        updated_at: updated_at.to_owned(),
    });
    rows.push(MobileVersionPolicyUpsertRow {
        id: config_ids.minimum_version,
        ws_id: ROOT_WORKSPACE_ID,
        value: policy.minimum_version.clone().unwrap_or_default(),
        updated_at: updated_at.to_owned(),
    });
    rows.push(MobileVersionPolicyUpsertRow {
        id: config_ids.otp_enabled,
        ws_id: ROOT_WORKSPACE_ID,
        value: policy.otp_enabled.to_string(),
        updated_at: updated_at.to_owned(),
    });
    rows.push(MobileVersionPolicyUpsertRow {
        id: config_ids.store_url,
        ws_id: ROOT_WORKSPACE_ID,
        value: policy.store_url.clone().unwrap_or_default(),
        updated_at: updated_at.to_owned(),
    });
}

fn current_iso_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_seconds = now.as_secs() as i64;
    let millis = now.subsec_millis();
    let days = total_seconds.div_euclid(86_400);
    let seconds_of_day = total_seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };

    year += (month <= 2) as i64;

    (year, month, day)
}
