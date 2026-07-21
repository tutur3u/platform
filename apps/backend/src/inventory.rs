use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, constant_time_eq, contact,
    json_response, method_not_allowed,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

type HmacSha256 = Hmac<sha2::Sha256>;

pub(crate) const LOCAL_DEVELOPMENT_SIMULATED_ORDER_SECRET: &str =
    "tuturuuu-local-development-inventory-simulated-order-secret";
pub(crate) const INVENTORY_SIMULATED_ORDER_SECRET_KEYS: [&str; 6] = [
    "INVENTORY_SIMULATED_ORDER_SECRET",
    "TUTURUUU_APP_COORDINATION_SECRET",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "APP_COORDINATION_TOKEN_SECRET",
];

const INVENTORY_STOREFRONTS_PATH_PREFIX: &str = "/api/v1/inventory/storefronts/";
const INVENTORY_ORDERS_PATH_PREFIX: &str = "/api/v1/inventory/orders/";
const INVENTORY_APP_SESSION_TARGETS: [&str; 2] = ["storefront", "inventory"];
const PRIVATE_SCHEMA: &str = "private";
const PUBLIC_STOREFRONT_RPC: &str = "get_public_inventory_storefront";
const CHECKOUT_BY_PUBLIC_TOKEN_RPC: &str = "get_inventory_checkout_by_public_token";
const INVENTORY_CHECKOUT_SESSIONS_TABLE: &str = "inventory_checkout_sessions";
const INVENTORY_STOREFRONTS_TABLE: &str = "inventory_storefronts";
const WORKSPACE_MEMBERS_TABLE: &str = "workspace_members";
const MEMBER_WORKSPACE_TYPE: &str = "MEMBER";
const PRIVATE_CACHE_CONTROL: &str = "private, no-store";
const PUBLIC_STOREFRONT_CACHE_CONTROL: &str = "public, max-age=0, s-maxage=0, must-revalidate";
const SIMULATED_ORDER_PREFIX: &str = "simulated-order-";
const SIMULATED_ORDER_TOKEN_TYPE: &str = "inventory_simulated_order";
const SIMULATED_ORDER_TOKEN_VERSION: u8 = 1;

enum InventoryRoute<'a> {
    Order { public_token: &'a str },
    Storefront { slug: &'a str },
}

#[derive(Serialize)]
struct PublicStorefrontRpcRequest<'a> {
    p_storefront_slug: &'a str,
}

#[derive(Serialize)]
struct CheckoutByPublicTokenRpcRequest<'a> {
    p_public_token: &'a str,
}

#[derive(Deserialize)]
struct CheckoutStorefrontRow {
    storefront_id: Option<String>,
}

#[derive(Deserialize)]
struct CheckoutStorefrontAccessRow {
    visibility: Option<String>,
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

struct CheckoutStorefrontAccess {
    visibility: String,
    ws_id: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SimulatedOrderTokenClaims {
    currency: String,
    customer_email: String,
    customer_name: String,
    exp: u64,
    iat: u64,
    jti: String,
    store_slug: String,
    subtotal_amount: Number,
    total_amount: Number,
    typ: String,
    v: u8,
    ws_id: String,
}

pub(crate) async fn handle_inventory_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = inventory_route(request.path)?;

    Some(match request.method {
        "GET" => match route {
            InventoryRoute::Storefront { slug } => {
                storefront_get_response(config, request, slug, outbound).await
            }
            InventoryRoute::Order { public_token } => {
                order_get_response(config, request, public_token, outbound).await
            }
        },
        method => method_not_allowed(method, "GET"),
    })
}

async fn storefront_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    slug: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let payload = match fetch_public_storefront(&config.contact_data, slug, outbound).await {
        Ok(Some(payload)) => payload,
        Ok(None) => return inventory_not_found_response(),
        Err(()) => return storefront_error_response(),
    };
    let visibility = match storefront_field(&payload, "visibility") {
        Some(visibility @ ("public" | "private")) => visibility,
        _ => return storefront_error_response(),
    };
    let is_private = visibility == "private";

    if is_private {
        let Some(ws_id) = storefront_field(&payload, "wsId").filter(|ws_id| !ws_id.is_empty())
        else {
            return storefront_error_response();
        };

        if let Err(response) =
            authorize_private_inventory_access(config, request, ws_id, outbound).await
        {
            return response;
        }
    }

    let mut response = json_response(200, payload);
    response.cache_control = Some(if is_private {
        PRIVATE_CACHE_CONTROL
    } else {
        PUBLIC_STOREFRONT_CACHE_CONTROL
    });
    response
}

async fn order_get_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    public_token: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if is_simulated_order_token(public_token) {
        return match simulated_order_response(config, public_token) {
            Ok(Some(payload)) => json_response(200, payload),
            Ok(None) => inventory_not_found_response(),
            Err(()) => order_error_response(),
        };
    }

    let order =
        match fetch_checkout_by_public_token(&config.contact_data, public_token, outbound).await {
            Ok(Some(order)) => order,
            Ok(None) => return inventory_not_found_response(),
            Err(()) => return order_error_response(),
        };
    let access = match fetch_checkout_storefront_access(
        &config.contact_data,
        public_token,
        outbound,
    )
    .await
    {
        Ok(Some(access)) => access,
        Ok(None) => return inventory_not_found_response(),
        Err(()) => return order_error_response(),
    };
    let is_private = match access.visibility.as_str() {
        "public" => false,
        "private" => true,
        _ => return order_error_response(),
    };

    if is_private
        && let Err(response) =
            authorize_private_inventory_access(config, request, &access.ws_id, outbound).await
    {
        return response;
    }

    let mut response = json_response(200, json!({ "order": order }));
    if is_private {
        response.cache_control = Some(PRIVATE_CACHE_CONTROL);
    }
    response
}

async fn fetch_public_storefront(
    contact_data: &contact::ContactDataConfig,
    slug: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let body = serde_json::to_string(&PublicStorefrontRpcRequest {
        p_storefront_slug: slug,
    })
    .map_err(|_| ())?;
    let response = send_private_rpc(contact_data, outbound, PUBLIC_STOREFRONT_RPC, &body).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let payload = response.json::<Value>().map_err(|_| ())?;
    Ok((!payload.is_null()).then_some(payload))
}

async fn fetch_checkout_by_public_token(
    contact_data: &contact::ContactDataConfig,
    public_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let body = serde_json::to_string(&CheckoutByPublicTokenRpcRequest {
        p_public_token: public_token,
    })
    .map_err(|_| ())?;
    let response =
        send_private_rpc(contact_data, outbound, CHECKOUT_BY_PUBLIC_TOKEN_RPC, &body).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    let payload = response.json::<Value>().map_err(|_| ())?;
    Ok((!payload.is_null()).then_some(payload))
}

async fn fetch_checkout_storefront_access(
    contact_data: &contact::ContactDataConfig,
    public_token: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<CheckoutStorefrontAccess>, ()> {
    let Some(checkout_url) = contact_data.rest_url(
        INVENTORY_CHECKOUT_SESSIONS_TABLE,
        &[
            ("select", "storefront_id".to_owned()),
            ("public_token", format!("eq.{public_token}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let checkout_response =
        send_service_role_get(contact_data, outbound, &checkout_url, Some(PRIVATE_SCHEMA)).await?;

    if !is_success_status(checkout_response.status) {
        return Err(());
    }

    let Some(checkout) = decode_first_row::<CheckoutStorefrontRow>(&checkout_response)? else {
        return Ok(None);
    };
    let Some(storefront_id) = checkout.storefront_id.filter(|id| !id.is_empty()) else {
        return Ok(None);
    };
    let Some(storefront_url) = contact_data.rest_url(
        INVENTORY_STOREFRONTS_TABLE,
        &[
            ("select", "visibility,ws_id".to_owned()),
            ("id", format!("eq.{storefront_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let storefront_response = send_service_role_get(
        contact_data,
        outbound,
        &storefront_url,
        Some(PRIVATE_SCHEMA),
    )
    .await?;

    if !is_success_status(storefront_response.status) {
        return Err(());
    }

    let Some(storefront) = decode_first_row::<CheckoutStorefrontAccessRow>(&storefront_response)?
    else {
        return Ok(None);
    };
    let (Some(visibility), Some(ws_id)) = (
        storefront
            .visibility
            .filter(|visibility| !visibility.is_empty()),
        storefront.ws_id.filter(|ws_id| !ws_id.is_empty()),
    ) else {
        return Err(());
    };

    Ok(Some(CheckoutStorefrontAccess { visibility, ws_id }))
}

async fn authorize_private_inventory_access(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<(), BackendResponse> {
    let Some(user_id) = authenticated_inventory_user(config, request, outbound).await else {
        return Err(inventory_unauthorized_response());
    };

    match workspace_membership_type(&config.contact_data, &user_id, ws_id, outbound).await {
        Ok(Some(membership_type)) if membership_type == MEMBER_WORKSPACE_TYPE => Ok(()),
        Ok(_) => Err(inventory_forbidden_response()),
        Err(()) => Err(workspace_access_lookup_failed_response()),
    }
}

async fn authenticated_inventory_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<String> {
    if contact::request_has_app_session_token(request) {
        let identity =
            contact::resolve_app_session_identity(config, request, &INVENTORY_APP_SESSION_TARGETS)
                .ok()?;

        return non_empty_user_id(identity.id);
    }

    let access_token = supabase_auth::request_access_token(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;

    non_empty_user_id(user.id?)
}

async fn workspace_membership_type(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        WORKSPACE_MEMBERS_TABLE,
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url, None).await?;

    if !is_success_status(response.status) {
        return Err(());
    }

    Ok(decode_first_row::<WorkspaceMembershipRow>(&response)?.and_then(|row| row.membership_type))
}

async fn send_private_rpc(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    function: &str,
    body: &str,
) -> Result<OutboundResponse, ()> {
    let Some(url) = contact_data.rpc_url(function) else {
        return Err(());
    };

    send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        Some(body),
        Some(PRIVATE_SCHEMA),
    )
    .await
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema_profile: Option<&str>,
) -> Result<OutboundResponse, ()> {
    send_service_role_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        url,
        None,
        schema_profile,
    )
    .await
}

async fn send_service_role_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    body: Option<&str>,
    schema_profile: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(profile) = schema_profile {
        request = request
            .with_header("Accept-Profile", profile)
            .with_header("Content-Profile", profile);
    }

    if let Some(body) = body {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn simulated_order_response(
    config: &BackendConfig,
    public_token: &str,
) -> Result<Option<Value>, ()> {
    let Some(claims) = verify_simulated_order_token(config, public_token)? else {
        return Ok(None);
    };

    Ok(Some(json!({
        "order": {
            "completedAt": unix_seconds_to_iso8601(claims.iat),
            "conversionFeeEstimateAmount": 0,
            "currency": claims.currency,
            "customerAuthUid": null,
            "customerEmail": claims.customer_email,
            "customerName": claims.customer_name,
            "customerPhone": null,
            "expiresAt": null,
            "financeInvoiceId": null,
            "id": public_token,
            "lines": [],
            "note": null,
            "platformFeeAmount": 0,
            "polarCheckoutId": null,
            "polarCheckoutUrl": null,
            "polarEnvironment": null,
            "polarOrderId": null,
            "polarProductId": null,
            "polarStatus": null,
            "processingFeeEstimateAmount": 0,
            "publicToken": public_token,
            "status": "completed",
            "subtotalAmount": claims.subtotal_amount,
            "totalAmount": claims.total_amount,
            "wsId": claims.ws_id,
        },
    })))
}

fn verify_simulated_order_token(
    config: &BackendConfig,
    public_token: &str,
) -> Result<Option<SimulatedOrderTokenClaims>, ()> {
    let Some(token) = public_token.strip_prefix(SIMULATED_ORDER_PREFIX) else {
        return Ok(None);
    };
    let parts = token.split('.').collect::<Vec<_>>();
    if parts.len() != 2 || parts.iter().any(|part| part.is_empty()) {
        return Ok(None);
    }
    let encoded_claims = parts[0];
    let signature = parts[1];
    let secrets = simulated_order_secrets(config);

    if secrets.is_empty() {
        return Err(());
    }

    let valid_signature = secrets.iter().any(|secret| {
        sign_simulated_order_content(encoded_claims, secret)
            .is_some_and(|expected| constant_time_eq(signature.as_bytes(), expected.as_bytes()))
    });

    if !valid_signature {
        return Ok(None);
    }

    let Ok(claims_bytes) = URL_SAFE_NO_PAD.decode(encoded_claims) else {
        return Ok(None);
    };
    let Ok(claims) = serde_json::from_slice::<SimulatedOrderTokenClaims>(&claims_bytes) else {
        return Ok(None);
    };

    if claims.typ != SIMULATED_ORDER_TOKEN_TYPE
        || claims.v != SIMULATED_ORDER_TOKEN_VERSION
        || claims.exp <= current_unix_seconds()
    {
        return Ok(None);
    }

    Ok(Some(claims))
}

fn simulated_order_secrets(config: &BackendConfig) -> Vec<&str> {
    let mut secrets = config
        .inventory_simulated_order_secrets
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();

    if secrets.is_empty() && !config.environment.trim().eq_ignore_ascii_case("production") {
        secrets.push(LOCAL_DEVELOPMENT_SIMULATED_ORDER_SECRET);
    }

    secrets
}

fn sign_simulated_order_content(content: &str, secret: &str) -> Option<String> {
    let mut hmac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    hmac.update(content.as_bytes());
    Some(URL_SAFE_NO_PAD.encode(hmac.finalize().into_bytes()))
}

fn inventory_route(path: &str) -> Option<InventoryRoute<'_>> {
    if let Some(slug) = path.strip_prefix(INVENTORY_STOREFRONTS_PATH_PREFIX)
        && !slug.is_empty()
        && !slug.contains('/')
    {
        return Some(InventoryRoute::Storefront { slug });
    }

    if let Some(public_token) = path.strip_prefix(INVENTORY_ORDERS_PATH_PREFIX)
        && !public_token.is_empty()
        && !public_token.contains('/')
    {
        return Some(InventoryRoute::Order { public_token });
    }

    None
}

fn storefront_field<'a>(payload: &'a Value, key: &str) -> Option<&'a str> {
    payload
        .get("storefront")
        .and_then(Value::as_object)?
        .get(key)?
        .as_str()
}

fn decode_first_row<T: for<'de> Deserialize<'de>>(
    response: &OutboundResponse,
) -> Result<Option<T>, ()> {
    let rows = response.json::<Vec<T>>().map_err(|_| ())?;

    Ok(rows.into_iter().next())
}

fn non_empty_user_id(user_id: String) -> Option<String> {
    (!user_id.trim().is_empty()).then_some(user_id)
}

fn is_simulated_order_token(public_token: &str) -> bool {
    public_token.starts_with(SIMULATED_ORDER_PREFIX)
}

fn is_success_status(status: u16) -> bool {
    (200..300).contains(&status)
}

fn current_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn unix_seconds_to_iso8601(seconds: u64) -> String {
    let days = seconds / 86_400;
    let seconds_of_day = seconds % 86_400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month_prime = month_prime as i32;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };

    (year as i32, month as u32, day as u32)
}

fn inventory_not_found_response() -> BackendResponse {
    json_response(404, json!({ "message": "Not found" }))
}

fn inventory_unauthorized_response() -> BackendResponse {
    json_response(401, json!({ "error": "Unauthorized" }))
}

fn inventory_forbidden_response() -> BackendResponse {
    json_response(403, json!({ "message": "Forbidden" }))
}

fn workspace_access_lookup_failed_response() -> BackendResponse {
    json_response(
        500,
        json!({ "message": "Failed to verify workspace access" }),
    )
}

fn storefront_error_response() -> BackendResponse {
    json_response(500, json!({ "message": "Failed to load storefront" }))
}

fn order_error_response() -> BackendResponse {
    json_response(500, json!({ "message": "Failed to load order" }))
}

#[cfg(test)]
pub(crate) fn create_simulated_order_token_for_test(secret: &str) -> String {
    let claims = SimulatedOrderTokenClaims {
        currency: "USD".to_owned(),
        customer_email: "buyer@example.com".to_owned(),
        customer_name: "Buyer".to_owned(),
        exp: 4_102_444_800,
        iat: 1_797_264_000,
        jti: "test-jti".to_owned(),
        store_slug: "shop".to_owned(),
        subtotal_amount: Number::from(5000),
        total_amount: Number::from(5000),
        typ: SIMULATED_ORDER_TOKEN_TYPE.to_owned(),
        v: SIMULATED_ORDER_TOKEN_VERSION,
        ws_id: "workspace-1".to_owned(),
    };
    let encoded_claims =
        URL_SAFE_NO_PAD.encode(serde_json::to_string(&claims).expect("test claims JSON"));
    let signature =
        sign_simulated_order_content(&encoded_claims, secret).expect("test simulated signature");

    format!("{SIMULATED_ORDER_PREFIX}{encoded_claims}.{signature}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contact::{self, APP_SESSION_SCOPE, AppCoordinationClaims};
    use crate::outbound::{OutboundError, OutboundFuture};
    use std::sync::Mutex;

    #[derive(Clone, Debug, Eq, PartialEq)]
    struct RecordedOutboundRequest {
        body: Option<String>,
        headers: Vec<(String, String)>,
        method: OutboundMethod,
        url: String,
    }

    #[derive(Default)]
    struct TestOutboundHttpClient {
        requests: Mutex<Vec<RecordedOutboundRequest>>,
        responses: Mutex<Vec<Result<OutboundResponse, OutboundError>>>,
    }

    impl TestOutboundHttpClient {
        fn new(responses: Vec<OutboundResponse>) -> Self {
            Self {
                requests: Mutex::new(Vec::new()),
                responses: Mutex::new(responses.into_iter().map(Ok).rev().collect()),
            }
        }

        fn recorded_requests(&self) -> Vec<RecordedOutboundRequest> {
            self.requests.lock().unwrap().clone()
        }
    }

    impl OutboundHttpClient for TestOutboundHttpClient {
        fn send<'a>(&'a self, request: OutboundRequest<'a>) -> OutboundFuture<'a> {
            let recorded = RecordedOutboundRequest {
                body: request.body.map(str::to_owned),
                headers: request
                    .headers
                    .iter()
                    .map(|header| (header.name.to_owned(), header.value.to_owned()))
                    .collect(),
                method: request.method,
                url: request.url.to_owned(),
            };
            self.requests.lock().unwrap().push(recorded);
            let response = self
                .responses
                .lock()
                .unwrap()
                .pop()
                .expect("missing outbound response");

            Box::pin(async move { response })
        }
    }

    fn test_config() -> BackendConfig {
        let mut config = BackendConfig::new("test", "backend");
        config
            .app_coordination_secrets
            .push("test-app-session-secret".to_owned());
        config
            .inventory_simulated_order_secrets
            .push("test-simulated-secret".to_owned());
        config.contact_data = contact::ContactDataConfig::new(
            "https://project-ref.supabase.co/",
            "test-service-role-secret",
        );
        config
    }

    fn request(method: &'static str, path: &'static str) -> BackendRequest<'static> {
        BackendRequest {
            authorization: None,
            body_text: None,
            cookie: None,
            if_none_match: None,
            method,
            origin: None,
            path,
            referer: None,
            request_id: None,
            url: Some("https://tuturuuu.localhost/test"),
        }
    }

    fn request_with_bearer(
        method: &'static str,
        path: &'static str,
        token: String,
    ) -> BackendRequest<'static> {
        BackendRequest {
            authorization: Some(Box::leak(format!("Bearer {token}").into_boxed_str())),
            ..request(method, path)
        }
    }

    fn response(status: u16, body: &str) -> OutboundResponse {
        OutboundResponse {
            body_text: body.to_owned(),
            headers: Vec::new(),
            status,
        }
    }

    fn app_session_claims(target_app: &str) -> AppCoordinationClaims {
        AppCoordinationClaims {
            aud: contact::app_coordination_token_audience().to_owned(),
            email: Some("app-session@example.com".to_owned()),
            exp: 4_102_444_800,
            iat: 0,
            iss: contact::app_coordination_token_issuer().to_owned(),
            jti: "test-jti".to_owned(),
            origin_app: "web".to_owned(),
            scopes: vec![APP_SESSION_SCOPE.to_owned()],
            sub: "app-session-user-1".to_owned(),
            target_app: target_app.to_owned(),
            typ: "app_coordination".to_owned(),
        }
    }

    fn app_session_token(target_app: &str) -> String {
        let encoded_header = contact::encode_app_session_part(r#"{"alg":"HS256","typ":"JWT"}"#);
        let encoded_payload = contact::encode_app_session_part(
            serde_json::to_string(&app_session_claims(target_app)).unwrap(),
        );
        let unsigned = format!("{encoded_header}.{encoded_payload}");
        let signature =
            contact::sign_app_coordination_content(&unsigned, "test-app-session-secret")
                .expect("test app-session signature");

        format!(
            "{}{unsigned}.{signature}",
            contact::app_coordination_token_prefix()
        )
    }

    fn header_value<'a>(request: &'a RecordedOutboundRequest, name: &str) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    #[tokio::test]
    async fn inventory_storefront_get_serves_public_payload_with_public_cache() {
        let outbound = TestOutboundHttpClient::new(vec![response(
            200,
            r#"{"storefront":{"id":"storefront-1","visibility":"public","wsId":"ws-1"},"listings":[],"bundles":[{"id":"bundle-1","pricingMode":"selected_items","categoryCandidateScope":"all_stock","categoryComponents":[{"id":"component-1","categoryId":"category-1","quantityRequired":3,"freeQuantity":1,"discountStrategy":"cheapest_free","candidates":[{"listingId":"listing-1","productId":"product-1","unitId":"unit-1","warehouseId":"warehouse-1","price":1200}]}]}]}"#,
        )]);

        let response = crate::handle_backend_request(
            &test_config(),
            request("GET", "/api/v1/inventory/storefronts/shop"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(
            response.cache_control,
            Some(PUBLIC_STOREFRONT_CACHE_CONTROL)
        );
        assert_eq!(response.body["storefront"]["id"], "storefront-1");
        assert_eq!(response.body["bundles"][0]["pricingMode"], "selected_items");
        assert_eq!(
            response.body["bundles"][0]["categoryComponents"][0]["quantityRequired"],
            3
        );
        assert_eq!(
            response.body["bundles"][0]["categoryComponents"][0]["candidates"][0]["listingId"],
            "listing-1"
        );
        let requests = outbound.recorded_requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(
            requests[0].url,
            "https://project-ref.supabase.co/rest/v1/rpc/get_public_inventory_storefront"
        );
        assert_eq!(
            header_value(&requests[0], "Accept-Profile"),
            Some("private")
        );
        assert_eq!(
            requests[0].body.as_deref(),
            Some(r#"{"p_storefront_slug":"shop"}"#)
        );
    }

    #[tokio::test]
    async fn inventory_storefront_get_requires_session_for_private_payloads() {
        let outbound = TestOutboundHttpClient::new(vec![response(
            200,
            r#"{"storefront":{"id":"storefront-1","visibility":"private","wsId":"ws-1"},"listings":[],"bundles":[]}"#,
        )]);

        let response = crate::handle_backend_request(
            &test_config(),
            request("GET", "/api/v1/inventory/storefronts/shop"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body["error"], "Unauthorized");
        assert_eq!(outbound.recorded_requests().len(), 1);
    }

    #[tokio::test]
    async fn inventory_storefront_get_allows_private_payloads_for_workspace_members() {
        let outbound = TestOutboundHttpClient::new(vec![
            response(
                200,
                r#"{"storefront":{"id":"storefront-1","visibility":"private","wsId":"ws-1"},"listings":[],"bundles":[]}"#,
            ),
            response(200, r#"[{"type":"MEMBER"}]"#),
        ]);

        let response = crate::handle_backend_request(
            &test_config(),
            request_with_bearer(
                "GET",
                "/api/v1/inventory/storefronts/shop",
                app_session_token("storefront"),
            ),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(PRIVATE_CACHE_CONTROL));
        let requests = outbound.recorded_requests();
        assert_eq!(requests.len(), 2);
        assert_eq!(
            requests[1].url,
            "https://project-ref.supabase.co/rest/v1/workspace_members?select=type&ws_id=eq.ws-1&user_id=eq.app-session-user-1&limit=1"
        );
    }

    #[tokio::test]
    async fn inventory_storefront_get_rejects_private_payloads_for_guests() {
        let outbound = TestOutboundHttpClient::new(vec![
            response(
                200,
                r#"{"storefront":{"id":"storefront-1","visibility":"private","wsId":"ws-1"},"listings":[],"bundles":[]}"#,
            ),
            response(200, r#"[{"type":"GUEST"}]"#),
        ]);

        let response = crate::handle_backend_request(
            &test_config(),
            request_with_bearer(
                "GET",
                "/api/v1/inventory/storefronts/shop",
                app_session_token("inventory"),
            ),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 403);
        assert_eq!(response.body["message"], "Forbidden");
    }

    #[tokio::test]
    async fn inventory_order_get_returns_signed_simulated_orders_without_outbound_reads() {
        let token = create_simulated_order_token_for_test("test-simulated-secret");
        let outbound = TestOutboundHttpClient::default();

        let response = crate::handle_backend_request(
            &test_config(),
            request_with_bearer(
                "GET",
                Box::leak(format!("/api/v1/inventory/orders/{token}").into_boxed_str()),
                "ignored-browser-token".to_owned(),
            ),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.body["order"]["publicToken"], token);
        assert_eq!(response.body["order"]["totalAmount"], 5000);
        assert_eq!(
            response.body["order"]["completedAt"],
            "2026-12-14T16:00:00.000Z"
        );
        assert!(outbound.recorded_requests().is_empty());
    }

    #[tokio::test]
    async fn inventory_order_get_rejects_forged_simulated_orders_without_outbound_reads() {
        let outbound = TestOutboundHttpClient::default();

        let response = crate::handle_backend_request(
            &test_config(),
            request("GET", "/api/v1/inventory/orders/simulated-order-anything"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 404);
        assert_eq!(response.body["message"], "Not found");
        assert!(outbound.recorded_requests().is_empty());
    }

    #[tokio::test]
    async fn inventory_order_get_serves_public_persisted_orders() {
        let outbound = TestOutboundHttpClient::new(vec![
            response(
                200,
                r#"{"id":"checkout-1","publicToken":"public-token","status":"completed"}"#,
            ),
            response(200, r#"[{"storefront_id":"storefront-1"}]"#),
            response(200, r#"[{"visibility":"public","ws_id":"ws-1"}]"#),
        ]);

        let response = crate::handle_backend_request(
            &test_config(),
            request("GET", "/api/v1/inventory/orders/public-token"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, None);
        assert_eq!(response.body["order"]["id"], "checkout-1");
        assert_eq!(outbound.recorded_requests().len(), 3);
    }

    #[tokio::test]
    async fn inventory_order_get_requires_session_for_private_storefront_orders() {
        let outbound = TestOutboundHttpClient::new(vec![
            response(
                200,
                r#"{"id":"checkout-1","publicToken":"public-token","status":"completed"}"#,
            ),
            response(200, r#"[{"storefront_id":"storefront-1"}]"#),
            response(200, r#"[{"visibility":"private","ws_id":"ws-1"}]"#),
        ]);

        let response = crate::handle_backend_request(
            &test_config(),
            request("GET", "/api/v1/inventory/orders/public-token"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 401);
        assert_eq!(response.body["error"], "Unauthorized");
        assert_eq!(outbound.recorded_requests().len(), 3);
    }

    #[tokio::test]
    async fn inventory_order_get_serves_private_orders_for_browser_workspace_members() {
        let outbound = TestOutboundHttpClient::new(vec![
            response(
                200,
                r#"{"id":"checkout-1","publicToken":"public-token","status":"completed"}"#,
            ),
            response(200, r#"[{"storefront_id":"storefront-1"}]"#),
            response(200, r#"[{"visibility":"private","ws_id":"ws-1"}]"#),
            response(
                200,
                r#"{"id":"browser-user-1","email":"buyer@example.com"}"#,
            ),
            response(200, r#"[{"type":"MEMBER"}]"#),
        ]);

        let response = crate::handle_backend_request(
            &test_config(),
            request_with_bearer(
                "GET",
                "/api/v1/inventory/orders/public-token",
                "browser-access-token".to_owned(),
            ),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 200);
        assert_eq!(response.cache_control, Some(PRIVATE_CACHE_CONTROL));
        let requests = outbound.recorded_requests();
        assert_eq!(
            requests[3].url,
            "https://project-ref.supabase.co/auth/v1/user"
        );
        assert_eq!(
            header_value(&requests[3], "Authorization"),
            Some("Bearer browser-access-token")
        );
        assert_eq!(
            requests[4].url,
            "https://project-ref.supabase.co/rest/v1/workspace_members?select=type&ws_id=eq.ws-1&user_id=eq.browser-user-1&limit=1"
        );
    }

    #[tokio::test]
    async fn inventory_order_get_returns_not_found_when_storefront_metadata_is_missing() {
        let outbound = TestOutboundHttpClient::new(vec![
            response(
                200,
                r#"{"id":"checkout-1","publicToken":"public-token","status":"completed"}"#,
            ),
            response(200, r#"[]"#),
        ]);

        let response = crate::handle_backend_request(
            &test_config(),
            request("GET", "/api/v1/inventory/orders/public-token"),
            &outbound,
        )
        .await;

        assert_eq!(response.status, 404);
        assert_eq!(response.body["message"], "Not found");
    }

    #[tokio::test]
    async fn inventory_routes_reject_unsupported_methods() {
        for path in [
            "/api/v1/inventory/storefronts/shop",
            "/api/v1/inventory/orders/public-token",
        ] {
            let response = crate::handle_backend_request(
                &test_config(),
                request("POST", path),
                &TestOutboundHttpClient::default(),
            )
            .await;

            assert_eq!(response.status, 405);
            assert_eq!(response.allow, Some("GET"));
            assert_eq!(response.body["error"], "method not allowed");
        }
    }
}
