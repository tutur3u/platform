use super::*;

// ---------------------------------------------------------------------------
// Supabase reads
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TrackerRow {
    #[serde(default)]
    id: Value,
    #[serde(default)]
    ws_id: Value,
    #[serde(default)]
    name: Value,
    #[serde(default)]
    description: Value,
    #[serde(default)]
    color: Value,
    #[serde(default)]
    icon: Value,
    #[serde(default)]
    tracking_mode: Value,
    #[serde(default)]
    target_period: Value,
    #[serde(default)]
    target_operator: Value,
    #[serde(default)]
    target_value: Value,
    #[serde(default)]
    primary_metric_key: Value,
    #[serde(default)]
    aggregation_strategy: Value,
    #[serde(default)]
    input_schema: Value,
    #[serde(default)]
    quick_add_values: Value,
    #[serde(default)]
    freeze_allowance: Value,
    #[serde(default)]
    recovery_window_periods: Value,
    #[serde(default)]
    use_case: Value,
    #[serde(default)]
    template_category: Value,
    #[serde(default)]
    composer_mode: Value,
    #[serde(default)]
    composer_config: Value,
    #[serde(default)]
    start_date: Value,
    #[serde(default)]
    created_by: Value,
    #[serde(default)]
    is_active: Value,
    #[serde(default)]
    archived_at: Value,
    #[serde(default)]
    created_at: Value,
    #[serde(default)]
    updated_at: Value,
}

/// Mirrors the legacy `.eq('id', trackerId).is('archived_at', null).maybeSingle()`.
pub(super) async fn load_tracker(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tracker_id: &str,
) -> Result<Option<HabitTracker>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_habit_trackers",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{tracker_id}")),
            ("archived_at", "is.null".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<TrackerRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().map(map_tracker_row))
}

fn map_tracker_row(row: TrackerRow) -> HabitTracker {
    HabitTracker {
        id: value_to_string(&row.id),
        ws_id: value_to_string(&row.ws_id),
        name: value_to_string(&row.name),
        description: row.description.as_str().map(str::to_owned),
        color: value_to_string(&row.color).to_uppercase(),
        icon: row
            .icon
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| "Repeat".to_owned()),
        tracking_mode: if row.tracking_mode.as_str() == Some("daily_summary") {
            "daily_summary".to_owned()
        } else {
            "event_log".to_owned()
        },
        target_period: if row.target_period.as_str() == Some("weekly") {
            "weekly".to_owned()
        } else {
            "daily".to_owned()
        },
        target_operator: if row.target_operator.as_str() == Some("eq") {
            "eq".to_owned()
        } else {
            "gte".to_owned()
        },
        target_value: number_or(&row.target_value, 1.0),
        primary_metric_key: row
            .primary_metric_key
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(|| "value".to_owned()),
        aggregation_strategy: enum_or(
            &row.aggregation_strategy,
            &["max", "count_entries", "boolean_any"],
            "sum",
        ),
        input_schema: normalize_field_schema(&row.input_schema),
        quick_add_values: normalize_quick_add_values(&row.quick_add_values),
        freeze_allowance: number_or(&row.freeze_allowance, 0.0),
        recovery_window_periods: number_or(&row.recovery_window_periods, 0.0),
        use_case: enum_or(
            &row.use_case,
            &[
                "body_weight",
                "counter",
                "measurement",
                "workout_session",
                "wellness_check",
            ],
            "generic",
        ),
        template_category: enum_or(
            &row.template_category,
            &["strength", "health", "recovery", "discipline"],
            "custom",
        ),
        composer_mode: enum_or(
            &row.composer_mode,
            &[
                "quick_check",
                "quick_increment",
                "measurement",
                "workout_session",
            ],
            "advanced_custom",
        ),
        composer_config: normalize_composer_config(&row.composer_config),
        start_date: row
            .start_date
            .as_str()
            .map(str::to_owned)
            .unwrap_or_else(today_date_key),
        created_by: row.created_by.as_str().map(str::to_owned),
        is_active: row.is_active != Value::Bool(false),
        archived_at: row.archived_at.as_str().map(str::to_owned),
        created_at: row
            .created_at
            .as_str()
            .map(str::to_owned)
            .unwrap_or_default(),
        updated_at: row
            .updated_at
            .as_str()
            .map(str::to_owned)
            .unwrap_or_default(),
    }
}

#[derive(Deserialize)]
struct LinkRow {
    platform_user_id: Option<String>,
    virtual_user_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserRow {
    id: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

pub(super) async fn list_habit_tracker_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<Member>, ()> {
    let Some(links_url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "platform_user_id,virtual_user_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };
    let links_response = send_service_role_get(contact_data, outbound, &links_url).await?;
    if !(200..300).contains(&links_response.status) {
        return Err(());
    }
    let links: Vec<LinkRow> = links_response.json().map_err(|_| ())?;

    // Unique virtual user ids (preserve discovery order).
    let mut virtual_user_ids: Vec<String> = Vec::new();
    for link in &links {
        if let Some(id) = link.virtual_user_id.as_deref()
            && !virtual_user_ids.iter().any(|existing| existing == id)
        {
            virtual_user_ids.push(id.to_owned());
        }
    }

    let in_filter = if virtual_user_ids.is_empty() {
        format!("in.({ROOT_WORKSPACE_ID})")
    } else {
        format!("in.({})", virtual_user_ids.join(","))
    };
    let Some(users_url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "id,display_name,email,avatar_url".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", in_filter),
        ],
    ) else {
        return Err(());
    };
    let users_response = send_service_role_get(contact_data, outbound, &users_url).await?;
    if !(200..300).contains(&users_response.status) {
        return Err(());
    }
    let workspace_users: Vec<WorkspaceUserRow> = users_response.json().map_err(|_| ())?;

    let mut members: Vec<Member> = Vec::new();
    for link in &links {
        let Some(virtual_id) = link.virtual_user_id.as_deref() else {
            continue;
        };
        let Some(platform_id) = link.platform_user_id.as_deref() else {
            continue;
        };
        let Some(workspace_user) = workspace_users
            .iter()
            .find(|user| user.id.as_deref() == Some(virtual_id))
        else {
            continue;
        };

        let display_name = workspace_user
            .display_name
            .as_deref()
            .filter(|value| !value.is_empty())
            .or(workspace_user
                .email
                .as_deref()
                .filter(|value| !value.is_empty()))
            .unwrap_or(platform_id)
            .to_owned();

        members.push(Member {
            user_id: platform_id.to_owned(),
            workspace_user_id: workspace_user.id.clone(),
            display_name,
            email: workspace_user.email.clone(),
            avatar_url: workspace_user.avatar_url.clone(),
        });
    }

    members.sort_by(|left, right| left.display_name.cmp(&right.display_name));
    Ok(members)
}

/// Raw entry row; mirrors `mapEntryRow` input columns.
#[derive(Deserialize)]
struct EntryRow {
    #[serde(default)]
    id: Value,
    #[serde(default)]
    ws_id: Value,
    #[serde(default)]
    tracker_id: Value,
    #[serde(default)]
    user_id: Value,
    #[serde(default)]
    entry_kind: Value,
    #[serde(default)]
    entry_date: Value,
    #[serde(default)]
    occurred_at: Value,
    #[serde(default)]
    values: Value,
    #[serde(default)]
    primary_value: Value,
    #[serde(default)]
    note: Value,
    #[serde(default)]
    tags: Value,
    #[serde(default)]
    created_by: Value,
    #[serde(default)]
    created_at: Value,
    #[serde(default)]
    updated_at: Value,
}

pub(super) async fn list_tracker_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tracker_id: &str,
) -> Result<Vec<HabitEntry>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_habit_tracker_entries",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("tracker_id", format!("eq.{tracker_id}")),
            ("order", "entry_date.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<EntryRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().map(map_entry_row).collect())
}

/// Mirror of `mapEntryRow` + `normalizeEntryValues`. Produces both the streak
/// subset and the full JSON object used in the response `entries` array.
fn map_entry_row(row: EntryRow) -> HabitEntry {
    let id = value_to_string(&row.id);
    let ws_id = value_to_string(&row.ws_id);
    let tracker_id = value_to_string(&row.tracker_id);
    let user_id = value_to_string(&row.user_id);

    let entry_kind = if row.entry_kind.as_str() == Some("daily_summary") {
        "daily_summary"
    } else {
        "event_log"
    };

    let entry_date = row
        .entry_date
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(today_date_key);
    // mapEntryRow: occurred_at falls back to new Date().toISOString() when not a
    // string. We use an empty string only when truly absent; for sorting, that
    // sorts last, mirroring the dominant case where occurred_at is present.
    let occurred_at = row
        .occurred_at
        .as_str()
        .map(str::to_owned)
        .unwrap_or_default();

    let values = normalize_entry_values(&row.values);

    let primary_value_value = match &row.primary_value {
        Value::Number(number) => Value::Number(number.clone()),
        _ => Value::Null,
    };
    let primary_value = match &row.primary_value {
        Value::Number(number) => number.as_f64(),
        _ => None,
    };

    let note = match row.note {
        Value::String(text) => Value::String(text),
        _ => Value::Null,
    };

    let tags = match row.tags {
        Value::Array(items) => Value::Array(items.into_iter().filter(Value::is_string).collect()),
        _ => Value::Array(Vec::new()),
    };

    let created_by = match row.created_by {
        Value::String(text) => Value::String(text),
        _ => Value::Null,
    };

    let created_at = row
        .created_at
        .as_str()
        .map(str::to_owned)
        .unwrap_or_default();
    let updated_at = row
        .updated_at
        .as_str()
        .map(str::to_owned)
        .unwrap_or_default();

    let mut full = Map::new();
    full.insert("id".to_owned(), Value::String(id));
    full.insert("ws_id".to_owned(), Value::String(ws_id));
    full.insert("tracker_id".to_owned(), Value::String(tracker_id));
    full.insert("user_id".to_owned(), Value::String(user_id.clone()));
    full.insert(
        "entry_kind".to_owned(),
        Value::String(entry_kind.to_owned()),
    );
    full.insert("entry_date".to_owned(), Value::String(entry_date.clone()));
    full.insert("occurred_at".to_owned(), Value::String(occurred_at.clone()));
    full.insert("values".to_owned(), values.clone());
    full.insert("primary_value".to_owned(), primary_value_value);
    full.insert("note".to_owned(), note);
    full.insert("tags".to_owned(), tags);
    full.insert("created_by".to_owned(), created_by);
    full.insert("created_at".to_owned(), Value::String(created_at));
    full.insert("updated_at".to_owned(), Value::String(updated_at));

    HabitEntry {
        user_id,
        entry_date,
        occurred_at,
        primary_value,
        values,
        full,
    }
}

#[derive(Deserialize)]
struct StreakActionRow {
    #[serde(default)]
    user_id: Value,
    #[serde(default)]
    action_type: Value,
    #[serde(default)]
    period_start: Value,
}

pub(super) async fn list_tracker_streak_actions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tracker_id: &str,
) -> Result<Vec<StreakAction>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_habit_tracker_streak_actions",
        &[
            ("select", "*".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("tracker_id", format!("eq.{tracker_id}")),
            ("order", "period_start.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<StreakActionRow> = response.json().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .map(|row| StreakAction {
            user_id: value_to_string(&row.user_id),
            action_type: if row.action_type.as_str() == Some("repair") {
                "repair".to_owned()
            } else {
                "freeze".to_owned()
            },
            period_start: value_to_string(&row.period_start),
        })
        .collect())
}

#[derive(Deserialize)]
struct LatestStatRow {
    #[serde(default)]
    tracker_id: Value,
    #[serde(default)]
    latest_entry_id: Value,
    #[serde(default)]
    latest_entry_date: Value,
    #[serde(default)]
    latest_occurred_at: Value,
    #[serde(default)]
    latest_primary_value: Value,
    #[serde(default)]
    latest_values: Value,
}

pub(super) async fn get_latest_tracker_stats(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: Option<&str>,
    tracker_id: &str,
) -> Result<Option<LatestStat>, ()> {
    let Some(user_id) = user_id else {
        return Ok(None);
    };

    let Some(url) = contact_data.rpc_url("get_workspace_habit_tracker_latest_stats") else {
        return Err(());
    };
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let body = json!({
        "p_ws_id": ws_id,
        "p_user_id": user_id,
        "p_tracker_ids": [tracker_id],
    })
    .to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LatestStatRow> = response.json().map_err(|_| ())?;
    let mut map: HashMap<String, LatestStat> = HashMap::new();
    for row in rows {
        let row_tracker_id = value_to_string(&row.tracker_id);
        if row_tracker_id.is_empty() {
            continue;
        }
        map.insert(
            row_tracker_id,
            LatestStat {
                latest_entry_id: row.latest_entry_id.as_str().map(str::to_owned),
                latest_entry_date: row.latest_entry_date.as_str().map(str::to_owned),
                latest_occurred_at: row.latest_occurred_at.as_str().map(str::to_owned),
                latest_primary_value: row.latest_primary_value.as_f64(),
                latest_values: if row.latest_values.is_null() {
                    None
                } else {
                    Some(normalize_entry_values(&row.latest_values))
                },
            },
        );
    }

    Ok(map.remove(tracker_id))
}
