use super::*;
use serde_json::json;

fn request_for_cookie<'a>(url: &'a str, cookie: &'a str) -> BackendRequest<'a> {
    BackendRequest {
        authorization: None,
        body_text: None,
        cookie: Some(cookie),
        if_none_match: None,
        method: "GET",
        origin: Some(url),
        path: AUTH_ACCOUNTS_PATH,
        referer: None,
        request_id: None,
        url: Some(url),
    }
}

fn signed_cookie(secret: &str, device_id: &str, device_secret: &str) -> String {
    let payload = format!("{COOKIE_VERSION}.{device_id}.{device_secret}");
    let signature = sign_device_cookie_payload(secret, &payload).expect("cookie signature");
    format!("{payload}.{signature}")
}

#[test]
fn shared_hosts_prefer_shared_device_cookie_name() {
    let secret = "test-secret";
    let host_cookie = signed_cookie(secret, "host-device", "host-secret");
    let shared_cookie = signed_cookie(secret, "shared-device", "shared-secret");
    let header = format!(
        "{WEB_ACCOUNT_DEVICE_COOKIE_NAME}={host_cookie}; {LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME}={shared_cookie}"
    );

    let credential = device_credential_from_request(
        request_for_cookie("https://tasks.tuturuuu.com/api/v1/auth/accounts", &header),
        secret,
    )
    .expect("shared credential");

    assert_eq!(credential.device_id, "shared-device");
    assert_eq!(credential.secret, "shared-secret");
}

#[test]
fn shared_hosts_prefer_last_duplicate_shared_cookie_value() {
    let secret = "test-secret";
    let stale_cookie = signed_cookie(secret, "host-device", "host-secret");
    let shared_cookie = signed_cookie(secret, "shared-device", "shared-secret");
    let header = format!(
        "{LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME}={stale_cookie}; {LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME}={shared_cookie}"
    );

    let credential = device_credential_from_request(
        request_for_cookie("https://tasks.tuturuuu.com/api/v1/auth/accounts", &header),
        secret,
    )
    .expect("shared credential");

    assert_eq!(credential.device_id, "shared-device");
}

#[test]
fn custom_https_hosts_prefer_host_prefixed_cookie() {
    let secret = "test-secret";
    let host_cookie = signed_cookie(secret, "host-device", "host-secret");
    let legacy_cookie = signed_cookie(secret, "legacy-device", "legacy-secret");
    let header = format!(
        "{LEGACY_WEB_ACCOUNT_DEVICE_COOKIE_NAME}={legacy_cookie}; {WEB_ACCOUNT_DEVICE_COOKIE_NAME}={host_cookie}"
    );

    let credential = device_credential_from_request(
        request_for_cookie("https://nova.ai.vn/api/v1/auth/accounts", &header),
        secret,
    )
    .expect("host credential");

    assert_eq!(credential.device_id, "host-device");
}

#[test]
fn account_cors_reflects_first_party_origins_only() {
    let allowed = with_account_cors(
        BackendRequest {
            origin: Some("https://tasks.tuturuuu.localhost"),
            ..request_for_cookie("https://tasks.tuturuuu.localhost/api", "")
        },
        json_response(200, json!({ "ok": true })),
    );
    let denied = with_account_cors(
        BackendRequest {
            origin: Some("https://rewise.me"),
            ..request_for_cookie("https://rewise.me/api", "")
        },
        json_response(200, json!({ "ok": true })),
    );

    assert_eq!(
        allowed
            .headers
            .iter()
            .find(|(name, _)| *name == "Access-Control-Allow-Origin")
            .map(|(_, value)| value.as_str()),
        Some("https://tasks.tuturuuu.localhost")
    );
    assert!(
        denied
            .headers
            .iter()
            .all(|(name, _)| *name != "Access-Control-Allow-Origin")
    );
}
