use super::*;

const SEAT_ACTIVE_STATUSES: &[&str] = &["active", "trialing", "past_due"];

// ---------------------------------------------------------------------------
// Seat status
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SeatSubscriptionRow {
    seat_count: Option<Value>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct SeatProductRow {
    pricing_model: Option<String>,
    price_per_seat: Option<Value>,
}

/// Mirrors `getSeatStatus(sbAdmin, wsId)`. Returns a JSON object. Note: the
/// legacy code uses `Infinity` for non-seat-based seatCount/availableSeats;
/// JSON cannot represent Infinity, and `NextResponse.json` serializes
/// `Infinity` to `null`. We emit `null` to match the wire output.
pub(super) async fn get_seat_status(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Value {
    // Conservative fail-closed default matching legacy error branches.
    let conservative = json!({
        "isSeatBased": true,
        "seatCount": 0,
        "memberCount": 0,
        "availableSeats": 0,
        "canAddMember": false,
        "pricePerSeat": Value::Null,
    });

    let subscription = match fetch_seat_subscription(contact_data, outbound, ws_id).await {
        Ok(value) => value,
        Err(()) => return conservative,
    };

    let product = match &subscription {
        Some(sub) => match &sub.product_id {
            Some(product_id) if !product_id.trim().is_empty() => {
                match fetch_seat_product(contact_data, outbound, product_id).await {
                    Ok(value) => value,
                    Err(()) => return conservative,
                }
            }
            _ => None,
        },
        None => None,
    };

    if subscription.is_some() && product.is_none() {
        return conservative;
    }
    let member_count = match count_workspace_members(contact_data, outbound, ws_id).await {
        Ok(count) if (0..=9_007_199_254_740_991).contains(&count) => count,
        _ => return conservative,
    };

    let is_seat_based = subscription.is_some()
        && product.as_ref().and_then(|p| p.pricing_model.as_deref()) == Some("seat_based");

    if !is_seat_based {
        // Infinity -> null on the wire.
        return json!({
            "isSeatBased": false,
            "seatCount": Value::Null,
            "memberCount": member_count,
            "availableSeats": Value::Null,
            "canAddMember": true,
            "pricePerSeat": Value::Null,
        });
    }

    let seat_count = match subscription
        .as_ref()
        .and_then(|s| s.seat_count.as_ref())
        .and_then(|v| v.as_i64())
    {
        Some(count) if (1..=9_007_199_254_740_991).contains(&count) => count,
        _ => return conservative,
    };
    let available_seats = (seat_count - member_count).max(0);

    json!({
        "isSeatBased": true,
        "seatCount": seat_count,
        "memberCount": member_count,
        "availableSeats": available_seats,
        "canAddMember": available_seats > 0,
        "pricePerSeat": product
            .and_then(|p| p.price_per_seat)
            .unwrap_or(Value::Null),
    })
}

async fn fetch_seat_subscription(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Option<SeatSubscriptionRow>, ()> {
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
        .json::<Vec<SeatSubscriptionRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn fetch_seat_product(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_id: &str,
) -> Result<Option<SeatProductRow>, ()> {
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
        .json::<Vec<SeatProductRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn count_workspace_members(
    contact_data: &contact::ContactDataConfig,
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

    // A range-limited body is not an authoritative total count.
    Err(())
}
