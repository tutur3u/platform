use super::*;

// ---------------------------------------------------------------------------
// Polar (best-effort, native-only credentials)
// ---------------------------------------------------------------------------

/// Mirrors `fetchProducts(polar)` filtering. Best-effort: returns `[]` when
/// Polar credentials are unavailable or the request fails (legacy parity).
pub(super) async fn fetch_products(outbound: &impl OutboundHttpClient) -> Option<Vec<Value>> {
    let creds = polar_credentials()?;
    let url = format!(
        "{}/v1/products/?is_archived=false&limit=100",
        creds.api_base
    );
    let authorization = format!("Bearer {}", creds.access_token);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return Some(Vec::new());
    }

    let parsed = response.json::<PolarProductsList>().ok()?;
    let items = parsed.items.unwrap_or_default();

    Some(
        items
            .into_iter()
            .filter(|product| {
                !is_ai_credit_pack_product(product)
                    && parse_workspace_product_tier(product).is_some()
            })
            .collect(),
    )
}

#[derive(Deserialize)]
struct PolarProductsList {
    items: Option<Vec<Value>>,
}

fn is_ai_credit_pack_product(product: &Value) -> bool {
    product
        .get("metadata")
        .and_then(|m| m.get("product_type"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_lowercase() == "ai_credit_pack")
        .unwrap_or(false)
}

fn parse_workspace_product_tier(product: &Value) -> Option<String> {
    let tier = product
        .get("metadata")
        .and_then(|m| m.get("product_tier"))
        .and_then(|v| v.as_str())?;
    let upper = tier.trim().to_uppercase();
    matches!(upper.as_str(), "FREE" | "PLUS" | "PRO" | "ENTERPRISE").then_some(upper)
}

/// Mirrors `polar.customerSeats.listSeats({ subscriptionId })`, returning the
/// `seats` array. Best-effort: `None` on failure so the caller falls back to
/// an empty array (legacy parity).
pub(super) async fn fetch_seat_list(
    outbound: &impl OutboundHttpClient,
    subscription_id: &str,
) -> Option<Value> {
    let creds = polar_credentials()?;
    let url = format!(
        "{}/v1/customer-seats/?subscription_id={}",
        creds.api_base, subscription_id
    );
    let authorization = format!("Bearer {}", creds.access_token);
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    let body = response.json::<Value>().ok()?;
    body.get("seats").cloned()
}

struct PolarCredentials {
    access_token: String,
    api_base: &'static str,
}

/// Reads Polar credentials from the environment. Only available on the native
/// target; the worker target cannot read process env, so this returns `None`
/// there and Polar-derived fields fall back to empty (see module docs / notes).
#[cfg(feature = "native")]
fn polar_credentials() -> Option<PolarCredentials> {
    let access_token = std::env::var("POLAR_ACCESS_TOKEN")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())?;
    let sandbox = std::env::var("POLAR_SANDBOX")
        .map(|value| value.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let api_base = if sandbox {
        "https://sandbox-api.polar.sh"
    } else {
        "https://api.polar.sh"
    };

    Some(PolarCredentials {
        access_token,
        api_base,
    })
}

#[cfg(not(feature = "native"))]
fn polar_credentials() -> Option<PolarCredentials> {
    None
}
