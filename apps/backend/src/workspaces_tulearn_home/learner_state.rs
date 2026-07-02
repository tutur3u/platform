use super::*;

// ---------------------------------------------------------------------------
// Learner state (port of learner-state.ts::getLearnerState).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LearnerStateRow {
    hearts: Option<i64>,
    max_hearts: Option<i64>,
    xp_total: Option<i64>,
    current_streak: Option<i64>,
    longest_streak: Option<i64>,
    streak_freezes: Option<i64>,
    last_activity_date: Option<String>,
    last_heart_refill_at: Option<String>,
}

fn public_state_json(row: &LearnerStateRow) -> Value {
    json!({
        "hearts": row.hearts.unwrap_or(0),
        "max_hearts": row.max_hearts.unwrap_or(0),
        "xp_total": row.xp_total.unwrap_or(0),
        "current_streak": row.current_streak.unwrap_or(0),
        "longest_streak": row.longest_streak.unwrap_or(0),
        "streak_freezes": row.streak_freezes.unwrap_or(0),
        "last_activity_date": row.last_activity_date,
    })
}

pub(super) async fn get_learner_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Value, ()> {
    let select = "hearts,max_hearts,xp_total,current_streak,longest_streak,streak_freezes,last_activity_date,last_heart_refill_at";
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[
            ("select", select.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LearnerStateRow> = response.json().map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        // No state yet -> upsert an initial row (ignoreDuplicates) then read it.
        upsert_initial_learner_state(contact_data, outbound, ws_id, user_id).await?;
        return read_public_learner_state(contact_data, outbound, ws_id, user_id).await;
    };

    // Heart-refill mutation: only when hearts < max_hearts and the refill window
    // has elapsed since `last_heart_refill_at`.
    let hearts = row.hearts.unwrap_or(0);
    let max_hearts = row.max_hearts.unwrap_or(0);
    if hearts < max_hearts
        && let Some(last_refill_iso) = row.last_heart_refill_at.as_deref()
        && let Some(last_refill_ms) = parse_iso_millis(last_refill_iso)
        && last_refill_ms > 0
    {
        let now_ms = now_millis();
        if now_ms - last_refill_ms >= HEART_REFILL_MS {
            return refill_hearts(
                contact_data,
                outbound,
                ws_id,
                user_id,
                hearts,
                max_hearts,
                last_refill_iso,
            )
            .await;
        }
    }

    Ok(public_state_json(&row))
}

async fn upsert_initial_learner_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[("on_conflict", "ws_id,user_id".to_owned())],
    ) else {
        return Err(());
    };
    let body = json!({
        "ws_id": ws_id,
        "user_id": user_id,
        "hearts": DEFAULT_HEARTS,
        "max_hearts": DEFAULT_HEARTS,
    })
    .to_string();

    // Prefer: resolution=ignore-duplicates mirrors `upsert(..., { ignoreDuplicates: true })`.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "resolution=ignore-duplicates")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // 201 created or 200 (already exists / ignored) are both acceptable.
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(())
}

async fn read_public_learner_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Value, ()> {
    let select = "hearts,max_hearts,xp_total,current_streak,longest_streak,streak_freezes,last_activity_date";
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[
            ("select", select.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<LearnerStateRow> = response.json().map_err(|_| ())?;
    // legacy uses `.single()` here; a missing row is an error.
    let row = rows.into_iter().next().ok_or(())?;
    Ok(public_state_json(&row))
}

#[allow(clippy::too_many_arguments)]
async fn refill_hearts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    expected_hearts: i64,
    max_hearts: i64,
    expected_last_refill_iso: &str,
) -> Result<Value, ()> {
    let now = now_iso();
    let select = "hearts,max_hearts,xp_total,current_streak,longest_streak,streak_freezes,last_activity_date";
    // Conditional optimistic update: filter also on current hearts and
    // last_heart_refill_at so concurrent refills don't double-apply.
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("hearts", format!("eq.{expected_hearts}")),
            (
                "last_heart_refill_at",
                format!("eq.{expected_last_refill_iso}"),
            ),
            ("select", select.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let body = json!({
        "hearts": max_hearts,
        "last_heart_refill_at": now,
        "updated_at": now,
    })
    .to_string();

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Patch, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "return=representation")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LearnerStateRow> = response.json().map_err(|_| ())?;
    match rows.into_iter().next() {
        Some(row) => Ok(public_state_json(&row)),
        // The conditional update matched no row (a concurrent refill won the
        // race) -> re-read the public state, mirroring the legacy fallback.
        None => read_public_learner_state(contact_data, outbound, ws_id, user_id).await,
    }
}
