use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse,
    MOBILE_AUTH_CORS_ALLOW_HEADERS, MOBILE_AUTH_CORS_ALLOW_METHODS, MOBILE_AUTH_CORS_MAX_AGE,
    contact, json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

pub(crate) const INFRASTRUCTURE_MOBILE_VERSIONS_PATH: &str =
    "/api/v1/infrastructure/mobile-versions";
pub(crate) const MOBILE_VERSION_CHECK_PATH: &str = "/api/v1/mobile/version-check";
pub(crate) const OTP_SETTINGS_PATH: &str = "/api/v1/auth/otp/settings";

const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const AUTH_OTP_SETTINGS_DIAGNOSTIC_PREFIX: &str = "AUTH-OTP-SETTINGS";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_WORKSPACE_ROLES_PERMISSION: &str = "manage_workspace_roles";
const MOBILE_IOS_EFFECTIVE_VERSION: &str = "MOBILE_IOS_EFFECTIVE_VERSION";
const MOBILE_IOS_MINIMUM_VERSION: &str = "MOBILE_IOS_MINIMUM_VERSION";
const MOBILE_IOS_OTP_ENABLED: &str = "MOBILE_IOS_OTP_ENABLED";
const MOBILE_IOS_STORE_URL: &str = "MOBILE_IOS_STORE_URL";
const MOBILE_ANDROID_EFFECTIVE_VERSION: &str = "MOBILE_ANDROID_EFFECTIVE_VERSION";
const MOBILE_ANDROID_MINIMUM_VERSION: &str = "MOBILE_ANDROID_MINIMUM_VERSION";
const MOBILE_ANDROID_OTP_ENABLED: &str = "MOBILE_ANDROID_OTP_ENABLED";
const MOBILE_ANDROID_STORE_URL: &str = "MOBILE_ANDROID_STORE_URL";
const WEB_OTP_ENABLED: &str = "WEB_OTP_ENABLED";
const MOBILE_VERSION_POLICY_CONFIG_IDS: [&str; 9] = [
    MOBILE_IOS_EFFECTIVE_VERSION,
    MOBILE_IOS_MINIMUM_VERSION,
    MOBILE_IOS_OTP_ENABLED,
    MOBILE_IOS_STORE_URL,
    MOBILE_ANDROID_EFFECTIVE_VERSION,
    MOBILE_ANDROID_MINIMUM_VERSION,
    MOBILE_ANDROID_OTP_ENABLED,
    MOBILE_ANDROID_STORE_URL,
    WEB_OTP_ENABLED,
];
const MOBILE_VERSION_POLICY_ERROR: &str = "Failed to evaluate mobile version policy";
const MOBILE_VERSION_POLICIES_LOAD_ERROR: &str = "Failed to load mobile version policies";
const OTP_SETTINGS_ERROR: &str = "Failed to load OTP settings";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MobilePlatform {
    Ios,
    Android,
}

impl MobilePlatform {
    fn parse(value: Option<&str>) -> Result<Self, &'static str> {
        match value {
            Some("ios") => Ok(Self::Ios),
            Some("android") => Ok(Self::Android),
            _ => Err(r#"Invalid option: expected one of "ios"|"android""#),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Ios => "ios",
            Self::Android => "android",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct MobilePlatformVersionPolicy {
    effective_version: Option<String>,
    minimum_version: Option<String>,
    otp_enabled: bool,
    store_url: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct MobileVersionPolicies {
    ios: MobilePlatformVersionPolicy,
    android: MobilePlatformVersionPolicy,
    web_otp_enabled: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MobileVersionAdminAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

#[derive(Deserialize)]
struct WorkspaceConfigRow {
    id: String,
    value: Value,
}

#[derive(Deserialize)]
struct WorkspaceConfigValueRow {
    value: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MobilePlatformVersionPolicyResponse {
    effective_version: Option<String>,
    minimum_version: Option<String>,
    otp_enabled: bool,
    store_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MobileVersionPoliciesResponse {
    ios: MobilePlatformVersionPolicyResponse,
    android: MobilePlatformVersionPolicyResponse,
    web_otp_enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MobileVersionCheckResponse {
    platform: &'static str,
    current_version: String,
    effective_version: Option<String>,
    minimum_version: Option<String>,
    otp_enabled: bool,
    store_url: Option<String>,
    status: &'static str,
    should_update: bool,
    requires_update: bool,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

pub(crate) async fn handle_mobile_version_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    match (request.method, request.path) {
        ("GET", INFRASTRUCTURE_MOBILE_VERSIONS_PATH) => {
            Some(infrastructure_mobile_versions_response(config, request, outbound).await)
        }
        ("GET", OTP_SETTINGS_PATH) => Some(otp_settings_response(config, request, outbound).await),
        ("OPTIONS", OTP_SETTINGS_PATH) => None,
        (method, OTP_SETTINGS_PATH) => Some(method_not_allowed(method, "GET, OPTIONS")),
        ("GET", MOBILE_VERSION_CHECK_PATH) => {
            Some(mobile_version_check_response(config, request, outbound).await)
        }
        ("OPTIONS", MOBILE_VERSION_CHECK_PATH) => None,
        (method, MOBILE_VERSION_CHECK_PATH) => Some(method_not_allowed(method, "GET, OPTIONS")),
        _ => None,
    }
}

async fn infrastructure_mobile_versions_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if let Err(error) = authorize_mobile_version_admin(config, request, outbound).await {
        return mobile_version_admin_auth_error_response(error);
    }

    match get_mobile_version_policies(config, outbound).await {
        Ok(policies) => no_store_response(json_response(
            200,
            mobile_version_policies_response(policies),
        )),
        Err(()) => no_store_response(json_response(
            500,
            json!({ "message": MOBILE_VERSION_POLICIES_LOAD_ERROR }),
        )),
    }
}

async fn authorize_mobile_version_admin(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<(), MobileVersionAdminAuthError> {
    let contact_data = &config.contact_data;

    if !contact_data.configured() {
        return Err(MobileVersionAdminAuthError::Internal);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(MobileVersionAdminAuthError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(MobileVersionAdminAuthError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(MobileVersionAdminAuthError::Unauthorized);
    };

    match has_root_workspace_permission(
        contact_data,
        outbound,
        &user_id,
        MANAGE_WORKSPACE_ROLES_PERMISSION,
    )
    .await
    {
        Ok(true) => Ok(()),
        Ok(false) => Err(MobileVersionAdminAuthError::Forbidden),
        Err(()) => Err(MobileVersionAdminAuthError::Internal),
    }
}

async fn has_root_workspace_permission(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    permission: &str,
) -> Result<bool, ()> {
    let rpc_url = contact_data
        .rpc_url(HAS_WORKSPACE_PERMISSION_RPC)
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let body = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: permission,
        p_user_id: user_id,
        p_ws_id: ROOT_WORKSPACE_ID,
    })
    .map_err(|_| ())?;
    let authorization = format!("Bearer {service_role_key}");
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

    if !is_success_status(response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

fn mobile_version_admin_auth_error_response(error: MobileVersionAdminAuthError) -> BackendResponse {
    match error {
        MobileVersionAdminAuthError::Unauthorized => {
            no_store_response(json_response(401, json!({ "message": "Unauthorized" })))
        }
        MobileVersionAdminAuthError::Forbidden => {
            no_store_response(json_response(403, json!({ "message": "Forbidden" })))
        }
        MobileVersionAdminAuthError::Internal => no_store_response(json_response(
            500,
            json!({ "message": MOBILE_VERSION_POLICIES_LOAD_ERROR }),
        )),
    }
}

async fn otp_settings_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match parse_otp_settings_query(request.url) {
        Ok(query) => query,
        Err(message) => return mobile_json_response(400, json!({ "error": message })),
    };

    let otp_enabled = match query.client {
        OtpClient::Mobile => match get_mobile_version_policies(config, outbound).await {
            Ok(policies) => match query.platform {
                Some(MobilePlatform::Ios) => policies.ios.otp_enabled,
                Some(MobilePlatform::Android) => policies.android.otp_enabled,
                None => false,
            },
            Err(()) => {
                return mobile_json_response(
                    500,
                    json!({
                        "diagnosticCode": auth_otp_settings_diagnostic_code(),
                        "error": OTP_SETTINGS_ERROR,
                    }),
                );
            }
        },
        OtpClient::Web | OtpClient::Tulearn => {
            match get_web_otp_enabled_config(config, outbound).await {
                Ok(value) => value,
                Err(()) => {
                    return mobile_json_response(
                        200,
                        json!({
                            "diagnosticCode": auth_otp_settings_diagnostic_code(),
                            "otpEnabled": false,
                        }),
                    );
                }
            }
        }
    };

    mobile_json_response(200, json!({ "otpEnabled": otp_enabled }))
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OtpClient {
    Mobile,
    Tulearn,
    Web,
}

impl OtpClient {
    fn parse(value: Option<&str>) -> Result<Self, &'static str> {
        match value {
            Some("mobile") => Ok(Self::Mobile),
            Some("tulearn") => Ok(Self::Tulearn),
            Some("web") => Ok(Self::Web),
            _ => Err(r#"Invalid option: expected one of "web"|"mobile"|"tulearn""#),
        }
    }
}

struct OtpSettingsQuery {
    client: OtpClient,
    platform: Option<MobilePlatform>,
}

fn parse_otp_settings_query(request_url: Option<&str>) -> Result<OtpSettingsQuery, String> {
    let url = request_url
        .and_then(|value| url::Url::parse(value).ok())
        .ok_or_else(|| "Invalid request parameters".to_owned())?;
    let client = OtpClient::parse(
        url.query_pairs()
            .find_map(|(key, value)| (key == "client").then_some(value.into_owned()))
            .as_deref(),
    )
    .map_err(str::to_owned)?;
    let raw_platform = url
        .query_pairs()
        .find_map(|(key, value)| (key == "platform").then_some(value.into_owned()))
        .filter(|value| !value.is_empty());
    let platform = if let Some(value) = raw_platform.as_deref() {
        Some(MobilePlatform::parse(Some(value)).map_err(str::to_owned)?)
    } else {
        None
    };

    if client == OtpClient::Mobile && platform.is_none() {
        return Err("Mobile OTP settings requests must include a platform".to_owned());
    }

    Ok(OtpSettingsQuery { client, platform })
}

fn auth_otp_settings_diagnostic_code() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let suffix = (nanos & 0xFF_FFFF) as u32;

    format!("{AUTH_OTP_SETTINGS_DIAGNOSTIC_PREFIX}-{suffix:06X}")
}

async fn mobile_version_check_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let query = match parse_mobile_version_query(request.url) {
        Ok(query) => query,
        Err(message) => return mobile_json_response(400, json!({ "error": message })),
    };

    let policies = match get_mobile_version_policies(config, outbound).await {
        Ok(policies) => policies,
        Err(()) => {
            return mobile_json_response(
                500,
                json!({
                    "error": MOBILE_VERSION_POLICY_ERROR,
                }),
            );
        }
    };
    let response = evaluate_mobile_version_policy(query.platform, &query.version, &policies);

    mobile_json_response(200, response)
}

struct MobileVersionQuery {
    platform: MobilePlatform,
    version: String,
}

fn parse_mobile_version_query(request_url: Option<&str>) -> Result<MobileVersionQuery, String> {
    let url = request_url
        .and_then(|value| url::Url::parse(value).ok())
        .ok_or_else(|| "Invalid request parameters".to_owned())?;
    let platform = MobilePlatform::parse(
        url.query_pairs()
            .find_map(|(key, value)| (key == "platform").then_some(value.into_owned()))
            .as_deref(),
    )
    .map_err(str::to_owned)?;
    let version = url
        .query_pairs()
        .find_map(|(key, value)| (key == "version").then_some(value.into_owned()))
        .ok_or_else(|| "Invalid input: expected string, received null".to_owned())?;

    if !is_strict_semver(&version) {
        return Err("Version must use x.y.z format".to_owned());
    }

    Ok(MobileVersionQuery { platform, version })
}

async fn get_mobile_version_policies(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<MobileVersionPolicies, ()> {
    if !config.contact_data.configured() {
        return Err(());
    }

    let Some(url) = config.contact_data.rest_url(
        "workspace_configs",
        &[
            ("select", "id,value".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            (
                "id",
                format!("in.({})", MOBILE_VERSION_POLICY_CONFIG_IDS.join(",")),
            ),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<WorkspaceConfigRow>>().map_err(|_| ())?;
    let policies = normalize_mobile_version_policies(&rows);
    validate_mobile_version_policies(&policies).map_err(|_| ())?;

    Ok(policies)
}

async fn get_web_otp_enabled_config(
    config: &BackendConfig,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    if !config.contact_data.configured() {
        return Err(());
    }

    let Some(url) = config.contact_data.rest_url(
        "workspace_configs",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ROOT_WORKSPACE_ID}")),
            ("id", format!("eq.{WEB_OTP_ENABLED}")),
        ],
    ) else {
        return Err(());
    };
    let Some(service_role_key) = config.contact_data.service_role_key() else {
        return Err(());
    };
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<WorkspaceConfigValueRow>>()
        .map_err(|_| ())?;

    Ok(normalize_config_bool(rows.first().map(|row| &row.value)))
}

fn normalize_mobile_version_policies(rows: &[WorkspaceConfigRow]) -> MobileVersionPolicies {
    MobileVersionPolicies {
        ios: MobilePlatformVersionPolicy {
            effective_version: normalize_config_string(config_value(
                rows,
                MOBILE_IOS_EFFECTIVE_VERSION,
            )),
            minimum_version: normalize_config_string(config_value(
                rows,
                MOBILE_IOS_MINIMUM_VERSION,
            )),
            otp_enabled: normalize_config_bool(config_value(rows, MOBILE_IOS_OTP_ENABLED)),
            store_url: normalize_config_string(config_value(rows, MOBILE_IOS_STORE_URL)),
        },
        android: MobilePlatformVersionPolicy {
            effective_version: normalize_config_string(config_value(
                rows,
                MOBILE_ANDROID_EFFECTIVE_VERSION,
            )),
            minimum_version: normalize_config_string(config_value(
                rows,
                MOBILE_ANDROID_MINIMUM_VERSION,
            )),
            otp_enabled: normalize_config_bool(config_value(rows, MOBILE_ANDROID_OTP_ENABLED)),
            store_url: normalize_config_string(config_value(rows, MOBILE_ANDROID_STORE_URL)),
        },
        web_otp_enabled: normalize_config_bool(config_value(rows, WEB_OTP_ENABLED)),
    }
}

fn config_value<'a>(rows: &'a [WorkspaceConfigRow], id: &str) -> Option<&'a Value> {
    rows.iter().find(|row| row.id == id).map(|row| &row.value)
}

fn normalize_config_string(value: Option<&Value>) -> Option<String> {
    let trimmed = value?.as_str()?.trim();

    (!trimmed.is_empty()).then_some(trimmed.to_owned())
}

fn normalize_config_bool(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "on" | "true" | "yes"
            )
        }
        _ => false,
    }
}

fn validate_mobile_version_policies(policies: &MobileVersionPolicies) -> Result<(), ()> {
    for policy in [&policies.ios, &policies.android] {
        if policy
            .effective_version
            .as_deref()
            .is_some_and(|value| !is_strict_semver(value))
            || policy
                .minimum_version
                .as_deref()
                .is_some_and(|value| !is_strict_semver(value))
        {
            return Err(());
        }

        if let (Some(effective), Some(minimum)) = (
            policy.effective_version.as_deref(),
            policy.minimum_version.as_deref(),
        ) && compare_strict_semver(effective, minimum) < 0
        {
            return Err(());
        }

        if (policy.effective_version.is_some() || policy.minimum_version.is_some())
            && policy.store_url.is_none()
        {
            return Err(());
        }
    }

    let _ = policies.web_otp_enabled;

    Ok(())
}

fn evaluate_mobile_version_policy(
    platform: MobilePlatform,
    current_version: &str,
    policies: &MobileVersionPolicies,
) -> MobileVersionCheckResponse {
    let policy = match platform {
        MobilePlatform::Ios => &policies.ios,
        MobilePlatform::Android => &policies.android,
    };
    let status = if policy
        .minimum_version
        .as_deref()
        .is_some_and(|minimum| compare_strict_semver(current_version, minimum) < 0)
    {
        "update-required"
    } else if policy
        .effective_version
        .as_deref()
        .is_some_and(|effective| compare_strict_semver(current_version, effective) < 0)
    {
        "update-recommended"
    } else {
        "supported"
    };

    MobileVersionCheckResponse {
        platform: platform.as_str(),
        current_version: current_version.to_owned(),
        effective_version: policy.effective_version.clone(),
        minimum_version: policy.minimum_version.clone(),
        otp_enabled: policy.otp_enabled,
        store_url: policy.store_url.clone(),
        status,
        should_update: status != "supported",
        requires_update: status == "update-required",
    }
}

fn mobile_version_policies_response(
    policies: MobileVersionPolicies,
) -> MobileVersionPoliciesResponse {
    MobileVersionPoliciesResponse {
        ios: mobile_platform_version_policy_response(policies.ios),
        android: mobile_platform_version_policy_response(policies.android),
        web_otp_enabled: policies.web_otp_enabled,
    }
}

fn mobile_platform_version_policy_response(
    policy: MobilePlatformVersionPolicy,
) -> MobilePlatformVersionPolicyResponse {
    MobilePlatformVersionPolicyResponse {
        effective_version: policy.effective_version,
        minimum_version: policy.minimum_version,
        otp_enabled: policy.otp_enabled,
        store_url: policy.store_url,
    }
}

fn mobile_json_response(status: u16, payload: impl Serialize) -> BackendResponse {
    let mut response = json_response(status, payload);
    add_mobile_cors_headers(&mut response);
    response
}

fn add_mobile_cors_headers(response: &mut BackendResponse) {
    response
        .headers
        .push(("access-control-allow-origin", "*".to_owned()));
    response.headers.push((
        "access-control-allow-methods",
        MOBILE_AUTH_CORS_ALLOW_METHODS.to_owned(),
    ));
    response.headers.push((
        "access-control-allow-headers",
        MOBILE_AUTH_CORS_ALLOW_HEADERS.to_owned(),
    ));
    response.headers.push((
        "access-control-max-age",
        MOBILE_AUTH_CORS_MAX_AGE.to_owned(),
    ));
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn is_strict_semver(value: &str) -> bool {
    let mut parts = value.split('.');

    matches!(
        (parts.next(), parts.next(), parts.next(), parts.next()),
        (Some(major), Some(minor), Some(patch), None)
            if is_strict_semver_part(major)
                && is_strict_semver_part(minor)
                && is_strict_semver_part(patch)
    )
}

fn is_strict_semver_part(value: &str) -> bool {
    value == "0"
        || (!value.is_empty()
            && !value.starts_with('0')
            && value.chars().all(|character| character.is_ascii_digit()))
}

fn compare_strict_semver(left: &str, right: &str) -> i8 {
    let mut left_parts = left.split('.');
    let mut right_parts = right.split('.');

    for _ in 0..3 {
        let ordering = compare_numeric_semver_part(
            left_parts.next().unwrap_or_default(),
            right_parts.next().unwrap_or_default(),
        );

        if ordering != 0 {
            return ordering;
        }
    }

    0
}

fn compare_numeric_semver_part(left: &str, right: &str) -> i8 {
    match left.len().cmp(&right.len()) {
        std::cmp::Ordering::Less => -1,
        std::cmp::Ordering::Greater => 1,
        std::cmp::Ordering::Equal => match left.cmp(right) {
            std::cmp::Ordering::Less => -1,
            std::cmp::Ordering::Equal => 0,
            std::cmp::Ordering::Greater => 1,
        },
    }
}

#[cfg(test)]
pub(crate) fn mobile_version_policy_error() -> &'static str {
    MOBILE_VERSION_POLICY_ERROR
}
