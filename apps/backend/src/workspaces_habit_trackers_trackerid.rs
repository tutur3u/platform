//! Handler for `/api/v1/workspaces/:wsId/habit-trackers/:trackerId`.
//!
//! Ports the **GET** method of the legacy Next.js route
//! `apps/web/src/app/api/v1/workspaces/[wsId]/habit-trackers/[trackerId]/route.ts`,
//! which returns a `HabitTrackerDetailResponse`:
//!   - `tracker`
//!   - `entries`  (recent entries for the tracker, sorted by `occurred_at`
//!     descending, truncated to 50, each augmented with a `member` field)
//!   - `current_member` (omitted when absent)
//!   - `team`
//!   - `member_summaries`
//!   - `leaderboard`
//!   - `current_period_metrics`
//!
//! The legacy route ALSO defines PATCH (update) and DELETE (archive). Those
//! methods are NOT migrated here: this handler returns `None` for them so the
//! Cloudflare worker falls through to the still-active Next.js route. Returning
//! a 405 would incorrectly reject still-valid mutations.
//!
//! Auth + gating mirrors the legacy `createHabitTrackerRouteContext`:
//!   1. `assertValidTrackerId(trackerId)` — invalid UUID -> 400
//!      "Invalid habit tracker ID" (runs before auth in the legacy route).
//!   2. Resolve the Supabase auth user from the bearer token (401 otherwise).
//!   3. Normalize the workspace id (personal / internal / handle / uuid).
//!   4. Verify the caller is a workspace MEMBER (403 / 500 otherwise).
//!   5. Require the `ENABLE_HABITS` workspace secret to equal `"true"` (404).
//!   6. Load the tracker (not archived) — 404 if missing.
//!
//! All Supabase reads use the service-role key (the legacy service layer runs
//! through `sbAdmin`, the admin client), matching `workspace_habits_access.rs`
//! and the sibling habit-tracker handlers.
//!
//! NOTE FOR INTEGRATOR: every helper below (workspace normalization, membership
//! / habits-secret checks, the streak engine, JSON normalizers, outbound REST
//! helpers) is intentionally COPIED file-local from the sibling modules
//! `workspaces_habit_trackers.rs` / `workspaces_habit_trackers_trackerid_entries.rs`
//! / `workspace_habits_access.rs`, because those modules expose them only as
//! private fns. This module edits no existing file. If those helpers are ever
//! promoted to `pub(crate)`, the copies here can be replaced.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_HABITS_SECRET: &str = "ENABLE_HABITS";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const HABIT_TRACKERS_SEGMENT: &str = "/habit-trackers/";

const MAX_RECENT_ENTRIES: usize = 50;
const METRICS_TAIL: usize = 12;

// Error messages copied verbatim from the legacy HabitTrackerError usages so the
// JSON `{ "error": ... }` payloads match exactly.
const MSG_INVALID_TRACKER_ID: &str = "Invalid habit tracker ID";
const MSG_UNAUTHORIZED: &str = "Please sign in to use habit trackers";
const MSG_MEMBERSHIP_LOOKUP_FAILED: &str = "Failed to verify workspace membership";
const MSG_ACCESS_DENIED: &str = "Workspace access denied";
const MSG_NOT_FOUND: &str = "Not found";
const MSG_TRACKER_NOT_FOUND: &str = "Habit tracker not found";
const MSG_LOAD_TRACKER_FAILED: &str = "Failed to load habit tracker";
const MSG_INTERNAL_ERROR: &str = "Internal server error";

/// Typed error used internally to short-circuit with a JSON `{ "error": ... }`
/// response carrying a specific status + message.
struct HabitError {
    status: u16,
    message: &'static str,
}

impl HabitError {
    fn new(status: u16, message: &'static str) -> Self {
        Self { status, message }
    }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_habit_trackers_trackerid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, tracker_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => {
            match get_detail_response(config, request, raw_ws_id, tracker_id, outbound).await {
                Ok(response) => response,
                Err(err) => error_response(err.status, err.message),
            }
        }
        // Every non-migrated method (PATCH, DELETE, ...) must fall through to the
        // still-active Next.js route, NOT return a 405.
        _ => return None,
    })
}

/// Match `/api/v1/workspaces/{wsId}/habit-trackers/{trackerId}` and extract
/// `(wsId, trackerId)`. Both segments must be non-empty and contain no further
/// slashes. The trailing-slash and any sub-resource (e.g. `/entries`) cases are
/// rejected so this handler never shadows the collection or sub-routes.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let inner = path.strip_prefix(PATH_PREFIX)?;
    let (ws_id, tracker_id) = inner.split_once(HABIT_TRACKERS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if tracker_id.is_empty() || tracker_id.contains('/') {
        return None;
    }

    Some((ws_id, tracker_id))
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
enum Scope {
    SelfScope,
    Team,
    Member,
}

struct DetailQuery {
    scope: Scope,
    user_id: Option<String>,
}

async fn get_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    tracker_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<BackendResponse, HabitError> {
    // assertValidTrackerId(trackerId) runs before auth in the legacy route.
    if !is_uuid(tracker_id) {
        return Err(HabitError::new(400, MSG_INVALID_TRACKER_ID));
    }

    let contact_data = &config.contact_data;

    // 1. Authenticate the caller.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(HabitError::new(401, MSG_UNAUTHORIZED));
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return Err(HabitError::new(401, MSG_UNAUTHORIZED));
    };

    // 2. Parse the query string (scope / userId). Invalid input maps to the
    //    legacy zod-failure path: a 500 "Internal server error".
    let query = parse_query(request.url).map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    // 3. normalizeWorkspaceId(wsId, supabase)
    let resolved_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
            .map_err(|()| HabitError::new(500, MSG_MEMBERSHIP_LOOKUP_FAILED))?;

    // 4. verifyWorkspaceMembership -> requires MEMBER, else 403 / 500.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return Err(HabitError::new(403, MSG_ACCESS_DENIED)),
        Err(()) => return Err(HabitError::new(500, MSG_MEMBERSHIP_LOOKUP_FAILED)),
    }

    // 5. isHabitsEnabled -> 404 "Not found" when disabled.
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return Err(HabitError::new(404, MSG_NOT_FOUND));
    }

    // 6. Build the detail response.
    build_detail_response(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        tracker_id,
        &query,
    )
    .await
    .map(|value| no_store_response(json_response(200, value)))
}

fn parse_query(request_url: Option<&str>) -> Result<DetailQuery, ()> {
    let mut scope = Scope::SelfScope;
    let mut user_id: Option<String> = None;

    if let Some(url) = request_url.and_then(|url| url::Url::parse(url).ok()) {
        for (key, value) in url.query_pairs() {
            match key.as_ref() {
                "scope" => {
                    let value = value.trim();
                    if value.is_empty() {
                        continue;
                    }
                    scope = match value {
                        "self" => Scope::SelfScope,
                        "team" => Scope::Team,
                        "member" => Scope::Member,
                        // Invalid scope: legacy zod parse fails.
                        _ => return Err(()),
                    };
                }
                "userId" => {
                    let value = value.trim();
                    if value.is_empty() {
                        continue;
                    }
                    if !is_uuid(value) {
                        // Invalid uuid: legacy zod parse fails.
                        return Err(());
                    }
                    user_id = Some(value.to_owned());
                }
                _ => {}
            }
        }
    }

    Ok(DetailQuery { scope, user_id })
}

// ---------------------------------------------------------------------------
// Response assembly
// ---------------------------------------------------------------------------

async fn build_detail_response(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    viewer_id: &str,
    tracker_id: &str,
    query: &DetailQuery,
) -> Result<Value, HabitError> {
    // Members + tracker + entries + streak actions, mirroring the legacy
    // `Promise.all([...])`.
    let members = list_habit_tracker_members(contact_data, outbound, ws_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    let tracker = match load_tracker(contact_data, outbound, ws_id, tracker_id).await {
        Ok(Some(tracker)) => tracker,
        Ok(None) => return Err(HabitError::new(404, MSG_TRACKER_NOT_FOUND)),
        Err(()) => return Err(HabitError::new(500, MSG_LOAD_TRACKER_FAILED)),
    };

    let entries = list_tracker_entries(contact_data, outbound, ws_id, tracker_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;
    let actions = list_tracker_streak_actions(contact_data, outbound, ws_id, tracker_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    let scope_user_id = resolve_scope_user_id(&members, viewer_id, query);

    let latest_stats = get_latest_tracker_stats(
        contact_data,
        outbound,
        ws_id,
        scope_user_id.as_deref(),
        tracker_id,
    )
    .await
    .map_err(|()| HabitError::new(500, MSG_INTERNAL_ERROR))?;

    // Per-member summaries.
    let entry_refs: Vec<&HabitEntry> = entries.iter().collect();
    let action_refs: Vec<&StreakAction> = actions.iter().collect();

    let member_summaries: Vec<MemberSummary> = members
        .iter()
        .enumerate()
        .map(|(index, member)| {
            let member_entries: Vec<&HabitEntry> = entry_refs
                .iter()
                .copied()
                .filter(|entry| entry.user_id == member.user_id)
                .collect();
            let member_actions: Vec<&StreakAction> = action_refs
                .iter()
                .copied()
                .filter(|action| action.user_id == member.user_id)
                .collect();
            build_member_summary(&tracker, index, &member_entries, &member_actions)
        })
        .collect();

    let leaderboard = build_leaderboard(&member_summaries, &members);

    let current_member = match build_current_member_summary(
        &tracker,
        &members,
        &entry_refs,
        &action_refs,
        scope_user_id.as_deref(),
        &member_summaries,
        latest_stats.as_ref(),
    ) {
        Some(value) => value,
        None => Value::Null,
    };

    let team = build_team_summary(&member_summaries);

    let member_summaries_json: Vec<Value> = member_summaries
        .iter()
        .map(|summary| member_summary_json(summary, &members))
        .collect();

    // Recent entries: sort by occurred_at desc, take 50, attach member.
    let recent_entries = build_recent_entries(&entries, &members);

    // current_period_metrics depends on scope.
    let current_period_metrics = build_current_period_metrics(
        &tracker,
        &entry_refs,
        &action_refs,
        query.scope,
        &current_member,
        &members,
    );

    let mut object = Map::new();
    object.insert("tracker".to_owned(), tracker_json(&tracker));
    object.insert("entries".to_owned(), Value::Array(recent_entries));
    // `current_member` is `undefined` in JS when absent; omit it entirely so the
    // serialized JSON matches (an absent optional, not `null`).
    if !current_member.is_null() {
        object.insert("current_member".to_owned(), current_member);
    }
    object.insert("team".to_owned(), team);
    object.insert(
        "member_summaries".to_owned(),
        Value::Array(member_summaries_json),
    );
    object.insert("leaderboard".to_owned(), Value::Array(leaderboard));
    object.insert(
        "current_period_metrics".to_owned(),
        Value::Array(current_period_metrics),
    );

    Ok(Value::Object(object))
}

fn resolve_scope_user_id(
    members: &[Member],
    viewer_id: &str,
    query: &DetailQuery,
) -> Option<String> {
    match query.scope {
        Scope::Team => None,
        Scope::Member => {
            if let Some(requested) = query.user_id.as_deref()
                && members.iter().any(|member| member.user_id == requested)
            {
                return Some(requested.to_owned());
            }
            Some(viewer_id.to_owned())
        }
        Scope::SelfScope => Some(viewer_id.to_owned()),
    }
}

/// `current_period_metrics`: team scope aggregates across members; otherwise it
/// uses the current-member's metric series. When there is no current member,
/// the legacy route yields `[]`. All variants are tail-sliced to 12.
fn build_current_period_metrics(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
    scope: Scope,
    current_member: &Value,
    members: &[Member],
) -> Vec<Value> {
    if scope == Scope::Team {
        let metrics = aggregate_metrics_for_team(tracker, entries, actions);
        return tail(metrics, METRICS_TAIL);
    }

    // The legacy code keys off `currentMemberSummary` (truthy / falsy). We only
    // have the serialized JSON; `Value::Null` means "no current member".
    if current_member.is_null() {
        return Vec::new();
    }

    // Determine which user's entries/actions to use: the current member's
    // `member.user_id`.
    let Some(user_id) = current_member
        .get("member")
        .and_then(|member| member.get("user_id"))
        .and_then(Value::as_str)
    else {
        return Vec::new();
    };
    let _ = members; // kept for parity with the legacy signature.

    let member_entries: Vec<&HabitEntry> = entries
        .iter()
        .copied()
        .filter(|entry| entry.user_id == user_id)
        .collect();
    let member_actions: Vec<&StreakAction> = actions
        .iter()
        .copied()
        .filter(|action| action.user_id == user_id)
        .collect();

    let metrics = build_metric_series(tracker, &member_entries, &member_actions);
    let metrics_json: Vec<Value> = metrics.iter().map(metric_json).collect();
    tail(metrics_json, METRICS_TAIL)
}

fn tail(mut values: Vec<Value>, count: usize) -> Vec<Value> {
    if values.len() > count {
        values.split_off(values.len() - count)
    } else {
        values
    }
}

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct HabitTracker {
    id: String,
    ws_id: String,
    name: String,
    description: Option<String>,
    color: String,
    icon: String,
    tracking_mode: String,
    target_period: String,
    target_operator: String,
    target_value: f64,
    primary_metric_key: String,
    aggregation_strategy: String,
    input_schema: Value,
    quick_add_values: Vec<f64>,
    freeze_allowance: f64,
    recovery_window_periods: f64,
    use_case: String,
    template_category: String,
    composer_mode: String,
    composer_config: Value,
    start_date: String,
    created_by: Option<String>,
    is_active: bool,
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Clone, Debug)]
struct Member {
    user_id: String,
    workspace_user_id: Option<String>,
    display_name: String,
    email: Option<String>,
    avatar_url: Option<String>,
}

/// Streak-engine view of an entry (subset).
#[derive(Clone, Debug)]
struct HabitEntry {
    user_id: String,
    entry_date: String,
    occurred_at: String,
    primary_value: Option<f64>,
    /// The normalized `values` map (object) as raw JSON.
    values: Value,
    /// The full `mapEntryRow` JSON object (for the response `entries` array).
    full: Map<String, Value>,
}

#[derive(Clone, Debug)]
struct StreakAction {
    user_id: String,
    action_type: String,
    period_start: String,
}

#[derive(Clone, Debug)]
struct LatestStat {
    latest_entry_id: Option<String>,
    latest_entry_date: Option<String>,
    latest_occurred_at: Option<String>,
    latest_primary_value: Option<f64>,
    latest_values: Option<Value>,
}

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
async fn load_tracker(
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

async fn list_habit_tracker_members(
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

async fn list_tracker_entries(
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

async fn list_tracker_streak_actions(
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

async fn get_latest_tracker_stats(
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

// ---------------------------------------------------------------------------
// JSON normalizers (port of service.ts normalizers)
// ---------------------------------------------------------------------------

fn normalize_field_schema(input: &Value) -> Value {
    let Some(array) = input.as_array() else {
        return Value::Array(Vec::new());
    };
    let mut out = Vec::new();
    for field in array {
        let Some(field) = field.as_object() else {
            continue;
        };
        let key = field.get("key").and_then(Value::as_str).unwrap_or("");
        let label = field.get("label").and_then(Value::as_str).unwrap_or("");
        if key.is_empty() || label.is_empty() {
            continue;
        }
        let type_str = field.get("type").and_then(Value::as_str).unwrap_or("");
        let type_value = if ["boolean", "number", "duration", "text", "select"].contains(&type_str)
        {
            type_str
        } else {
            "number"
        };
        let unit = field
            .get("unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null);
        let required = field.get("required") == Some(&Value::Bool(true));

        let mut field_json = Map::new();
        field_json.insert("key".to_owned(), Value::String(key.to_owned()));
        field_json.insert("label".to_owned(), Value::String(label.to_owned()));
        field_json.insert("type".to_owned(), Value::String(type_value.to_owned()));
        field_json.insert("unit".to_owned(), unit);
        field_json.insert("required".to_owned(), Value::Bool(required));

        if let Some(options) = field.get("options").and_then(Value::as_array) {
            let normalized: Vec<Value> = options
                .iter()
                .filter_map(|option| option.as_object())
                .filter_map(|option| {
                    let label = option.get("label").and_then(Value::as_str).unwrap_or("");
                    let value = option.get("value").and_then(Value::as_str).unwrap_or("");
                    if label.is_empty() || value.is_empty() {
                        return None;
                    }
                    Some(json!({ "label": label, "value": value }))
                })
                .collect();
            field_json.insert("options".to_owned(), Value::Array(normalized));
        }

        out.push(Value::Object(field_json));
    }
    Value::Array(out)
}

fn normalize_quick_add_values(input: &Value) -> Vec<f64> {
    let Some(array) = input.as_array() else {
        return Vec::new();
    };
    array.iter().filter_map(value_to_finite_number).collect()
}

fn normalize_composer_config(input: &Value) -> Value {
    let Some(object) = input.as_object() else {
        return Value::Null;
    };

    let mut out = Map::new();
    out.insert(
        "unit".to_owned(),
        object
            .get("unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null),
    );

    if let Some(units) = object.get("supported_units").and_then(Value::as_array) {
        let normalized: Vec<Value> = units
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(|value| Value::String(value.to_owned()))
            .collect();
        out.insert("supported_units".to_owned(), Value::Array(normalized));
    }
    if let Some(increments) = object.get("suggested_increments").and_then(Value::as_array) {
        let normalized: Vec<Value> = increments
            .iter()
            .filter_map(value_to_finite_number)
            .map(json_number)
            .collect();
        out.insert("suggested_increments".to_owned(), Value::Array(normalized));
    }
    if let Some(variant) = object.get("progress_variant").and_then(Value::as_str)
        && ["ring", "bar", "check"].contains(&variant)
    {
        out.insert(
            "progress_variant".to_owned(),
            Value::String(variant.to_owned()),
        );
    }
    if let Some(exercises) = object.get("suggested_exercises").and_then(Value::as_array) {
        let normalized: Vec<Value> = exercises
            .iter()
            .filter_map(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(|value| Value::String(value.to_owned()))
            .collect();
        out.insert("suggested_exercises".to_owned(), Value::Array(normalized));
    }
    out.insert(
        "default_sets".to_owned(),
        finite_number_field(object.get("default_sets")),
    );
    out.insert(
        "default_reps".to_owned(),
        finite_number_field(object.get("default_reps")),
    );
    out.insert(
        "default_weight_unit".to_owned(),
        object
            .get("default_weight_unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null),
    );

    Value::Object(out)
}

fn finite_number_field(value: Option<&Value>) -> Value {
    match value.and_then(Value::as_f64) {
        Some(number) if number.is_finite() => json_number(number),
        _ => Value::Null,
    }
}

/// Mirrors `normalizeEntryValues`: keep null/bool/number/string scalars, and
/// arrays only if they normalize to >=1 valid exercise block.
fn normalize_entry_values(input: &Value) -> Value {
    let Some(object) = input.as_object() else {
        return Value::Object(Map::new());
    };
    let mut out = Map::new();
    for (key, value) in object {
        match value {
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
                out.insert(key.clone(), value.clone());
            }
            Value::Array(_) => {
                let blocks = normalize_exercise_blocks(value);
                if let Value::Array(items) = &blocks
                    && !items.is_empty()
                {
                    out.insert(key.clone(), blocks);
                }
            }
            Value::Object(_) => {}
        }
    }
    Value::Object(out)
}

fn normalize_exercise_blocks(input: &Value) -> Value {
    let Some(array) = input.as_array() else {
        return Value::Array(Vec::new());
    };
    let mut out = Vec::new();
    for block in array {
        let Some(block) = block.as_object() else {
            continue;
        };
        let exercise_name = block
            .get("exercise_name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_owned();
        let sets = block.get("sets").and_then(Value::as_f64).unwrap_or(0.0);
        let reps = block.get("reps").and_then(Value::as_f64).unwrap_or(0.0);
        if exercise_name.is_empty()
            || sets.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater)
            || reps.partial_cmp(&0.0) != Some(std::cmp::Ordering::Greater)
        {
            continue;
        }
        let weight = match block.get("weight").and_then(Value::as_f64) {
            Some(weight) if weight.is_finite() => json_number(weight),
            _ => Value::Null,
        };
        let unit = block
            .get("unit")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null);
        let notes = block
            .get("notes")
            .and_then(Value::as_str)
            .map(|value| Value::String(value.to_owned()))
            .unwrap_or(Value::Null);

        out.push(json!({
            "exercise_name": exercise_name,
            "sets": json_number(sets),
            "reps": json_number(reps),
            "weight": weight,
            "unit": unit,
            "notes": notes,
        }));
    }
    Value::Array(out)
}

// ---------------------------------------------------------------------------
// Tracker / member -> JSON serialization
// ---------------------------------------------------------------------------

fn tracker_json(tracker: &HabitTracker) -> Value {
    json!({
        "id": tracker.id,
        "ws_id": tracker.ws_id,
        "name": tracker.name,
        "description": tracker.description,
        "color": tracker.color,
        "icon": tracker.icon,
        "tracking_mode": tracker.tracking_mode,
        "target_period": tracker.target_period,
        "target_operator": tracker.target_operator,
        "target_value": json_number(tracker.target_value),
        "primary_metric_key": tracker.primary_metric_key,
        "aggregation_strategy": tracker.aggregation_strategy,
        "input_schema": tracker.input_schema,
        "quick_add_values": tracker
            .quick_add_values
            .iter()
            .map(|value| json_number(*value))
            .collect::<Vec<_>>(),
        "freeze_allowance": json_number(tracker.freeze_allowance),
        "recovery_window_periods": json_number(tracker.recovery_window_periods),
        "use_case": tracker.use_case,
        "template_category": tracker.template_category,
        "composer_mode": tracker.composer_mode,
        "composer_config": tracker.composer_config,
        "start_date": tracker.start_date,
        "created_by": tracker.created_by,
        "is_active": tracker.is_active,
        "archived_at": tracker.archived_at,
        "created_at": tracker.created_at,
        "updated_at": tracker.updated_at,
    })
}

fn member_json(member: &Member) -> Value {
    json!({
        "user_id": member.user_id,
        "workspace_user_id": member.workspace_user_id,
        "display_name": member.display_name,
        "email": member.email,
        "avatar_url": member.avatar_url,
    })
}

/// Builds the response `entries` array: sort by occurred_at desc, take 50,
/// attach a `member` field (or null).
fn build_recent_entries(entries: &[HabitEntry], members: &[Member]) -> Vec<Value> {
    let mut indexed: Vec<&HabitEntry> = entries.iter().collect();
    // occurred_at is an ISO-8601 UTC timestamp from Postgres; lexicographic desc
    // matches chronological desc for valid timestamps, matching JS getTime().
    indexed.sort_by(|left, right| right.occurred_at.cmp(&left.occurred_at));
    indexed.truncate(MAX_RECENT_ENTRIES);

    indexed
        .into_iter()
        .map(|entry| {
            let mut object = entry.full.clone();
            let member = members
                .iter()
                .find(|member| member.user_id == entry.user_id);
            object.insert(
                "member".to_owned(),
                match member {
                    Some(member) => member_json(member),
                    None => Value::Null,
                },
            );
            Value::Object(object)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Streak engine (port of streaks.ts)
// ---------------------------------------------------------------------------

const DAY_MS: i64 = 86_400_000;
const WEEK_STARTS_ON: i64 = 1;

#[derive(Clone)]
struct PeriodWindow {
    period_start: String,
    period_end: String,
}

#[derive(Clone)]
struct EffectiveMetric {
    period_start: String,
    period_end: String,
    total: f64,
    success: bool,
    used_freeze: bool,
    used_repair: bool,
    entry_count: f64,
    is_current_period: bool,
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year, month, day)
}

fn parse_date_key_days(value: &str) -> i64 {
    let parts: Vec<&str> = value.get(0..10).unwrap_or(value).split('-').collect();
    if parts.len() != 3 {
        return 0;
    }
    let year: i64 = parts[0].parse().unwrap_or(1970);
    let month: i64 = parts[1].parse().unwrap_or(1);
    let day: i64 = parts[2].parse().unwrap_or(1);
    days_from_civil(year, month, day)
}

fn format_date_key_from_days(days: i64) -> String {
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

/// JS `getUTCDay`: Sunday=0. Epoch day 0 (1970-01-01) is Thursday (4).
fn utc_weekday(days: i64) -> i64 {
    ((days % 7) + 4).rem_euclid(7)
}

fn start_of_utc_week_days(days: i64) -> i64 {
    let current_day = utc_weekday(days);
    let diff = (current_day - WEEK_STARTS_ON + 7) % 7;
    days - diff
}

fn today_days() -> i64 {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    now_ms.div_euclid(DAY_MS)
}

fn today_date_key() -> String {
    format_date_key_from_days(today_days())
}

fn get_period_window_for_date(date_key: &str, weekly: bool) -> PeriodWindow {
    let days = parse_date_key_days(date_key);
    if weekly {
        let period_start = start_of_utc_week_days(days);
        PeriodWindow {
            period_start: format_date_key_from_days(period_start),
            period_end: format_date_key_from_days(period_start + 6),
        }
    } else {
        let key = format_date_key_from_days(days);
        PeriodWindow {
            period_start: key.clone(),
            period_end: key,
        }
    }
}

fn current_period_window(weekly: bool) -> PeriodWindow {
    get_period_window_for_date(&today_date_key(), weekly)
}

fn enumerate_period_windows(start_date: &str, end_date: &str, weekly: bool) -> Vec<PeriodWindow> {
    let mut windows = Vec::new();
    if weekly {
        let mut cursor =
            parse_date_key_days(&get_period_window_for_date(start_date, true).period_start);
        let end = parse_date_key_days(&get_period_window_for_date(end_date, true).period_start);
        while cursor <= end {
            windows.push(PeriodWindow {
                period_start: format_date_key_from_days(cursor),
                period_end: format_date_key_from_days(cursor + 6),
            });
            cursor += 7;
        }
        return windows;
    }

    let mut cursor = parse_date_key_days(start_date);
    let end = parse_date_key_days(end_date);
    while cursor <= end {
        let key = format_date_key_from_days(cursor);
        windows.push(PeriodWindow {
            period_start: key.clone(),
            period_end: key,
        });
        cursor += 1;
    }
    windows
}

fn compare_to_target(total: f64, tracker: &HabitTracker) -> bool {
    if tracker.target_operator == "eq" {
        total == tracker.target_value
    } else {
        total >= tracker.target_value
    }
}

fn get_entry_numeric_value(tracker: &HabitTracker, entry: &HabitEntry) -> f64 {
    if tracker.aggregation_strategy == "count_entries" {
        return 1.0;
    }

    if tracker.aggregation_strategy == "boolean_any" {
        // raw = values[primary_metric_key] ?? primary_value ?? false
        let raw = entry
            .values
            .get(&tracker.primary_metric_key)
            .filter(|value| !value.is_null())
            .cloned()
            .or_else(|| {
                entry.primary_value.map(|value| {
                    Value::Number(serde_json::Number::from_f64(value).unwrap_or_else(|| 0.into()))
                })
            });
        return match raw {
            Some(Value::Bool(flag)) if flag => 1.0,
            Some(Value::Number(number)) => {
                let value = number.as_f64().unwrap_or(0.0);
                if value > 0.0 { 1.0 } else { 0.0 }
            }
            Some(other) if value_string_length(&other) > 0 => 1.0,
            None => 0.0,
            _ => 0.0,
        };
    }

    // raw = primary_value ?? values[primary_metric_key]
    let raw = entry.primary_value.or_else(|| {
        entry
            .values
            .get(&tracker.primary_metric_key)
            .and_then(Value::as_f64)
    });
    match raw {
        Some(value) if value.is_finite() => value,
        _ => 0.0,
    }
}

fn build_metric_series(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> Vec<EffectiveMetric> {
    let weekly = tracker.target_period == "weekly";
    let current_period = current_period_window(weekly);
    let today_key = today_date_key();
    let start_date = if tracker.start_date <= today_key {
        tracker.start_date.clone()
    } else {
        today_key
    };
    let windows = enumerate_period_windows(&start_date, &current_period.period_end, weekly);

    let mut totals: HashMap<String, (f64, f64)> = HashMap::new();
    let mut action_by_period: HashMap<String, (bool, bool)> = HashMap::new();

    for entry in entries {
        let period = get_period_window_for_date(&entry.entry_date, weekly);
        let current = totals.entry(period.period_start).or_insert((0.0, 0.0));
        let value = get_entry_numeric_value(tracker, entry);
        match tracker.aggregation_strategy.as_str() {
            "max" => current.0 = current.0.max(value),
            "count_entries" => current.0 += 1.0,
            "boolean_any" => current.0 = current.0.max(value),
            _ => current.0 += value,
        }
        current.1 += 1.0;
    }

    for action in actions {
        let entry = action_by_period
            .entry(action.period_start.clone())
            .or_insert((false, false));
        if action.action_type == "freeze" {
            entry.0 = true;
        } else if action.action_type == "repair" {
            entry.1 = true;
        }
    }

    windows
        .into_iter()
        .map(|window| {
            let (total, entry_count) = totals
                .get(&window.period_start)
                .copied()
                .unwrap_or((0.0, 0.0));
            let (used_freeze, used_repair) = action_by_period
                .get(&window.period_start)
                .copied()
                .unwrap_or((false, false));
            let success = compare_to_target(total, tracker);
            EffectiveMetric {
                is_current_period: window.period_start == current_period.period_start,
                period_start: window.period_start,
                period_end: window.period_end,
                total,
                success,
                used_freeze,
                used_repair,
                entry_count,
            }
        })
        .collect()
}

fn metric_json(metric: &EffectiveMetric) -> Value {
    json!({
        "period_start": metric.period_start,
        "period_end": metric.period_end,
        "total": json_number(metric.total),
        "success": metric.success,
        "used_freeze": metric.used_freeze,
        "used_repair": metric.used_repair,
        "entry_count": json_number(metric.entry_count),
    })
}

fn count_best_streak(metrics: &[EffectiveMetric]) -> i64 {
    let mut best = 0;
    let mut current = 0;
    for metric in metrics {
        if metric.success || metric.used_freeze || metric.used_repair {
            current += 1;
            best = best.max(current);
        } else {
            current = 0;
        }
    }
    best
}

fn count_current_streak(metrics: &[EffectiveMetric]) -> i64 {
    let mut index = metrics.len() as i64 - 1;
    if index < 0 {
        return 0;
    }
    if let Some(last) = metrics.get(index as usize)
        && last.is_current_period
        && !last.success
    {
        index -= 1;
    }
    let mut streak = 0;
    while index >= 0 {
        let Some(metric) = metrics.get(index as usize) else {
            break;
        };
        if !(metric.success || metric.used_freeze || metric.used_repair) {
            break;
        }
        streak += 1;
        index -= 1;
    }
    streak
}

fn build_recovery_window(tracker: &HabitTracker, metrics: &[EffectiveMetric]) -> Value {
    if tracker.recovery_window_periods <= 0.0 {
        return json!({ "eligible": false, "action": Value::Null });
    }
    let weekly = tracker.target_period == "weekly";

    let failed_metric = metrics
        .iter()
        .filter(|metric| !metric.is_current_period)
        .rev()
        .find(|metric| !metric.success && !metric.used_freeze && !metric.used_repair);

    let Some(failed_metric) = failed_metric else {
        return json!({ "eligible": false, "action": Value::Null });
    };

    let current_period_start = parse_date_key_days(&current_period_window(weekly).period_start);
    let failed_period_start = parse_date_key_days(&failed_metric.period_start);
    let distance = if weekly {
        (current_period_start - failed_period_start) / 7
    } else {
        current_period_start - failed_period_start
    };

    if distance as f64 > tracker.recovery_window_periods {
        return json!({ "eligible": false, "action": Value::Null });
    }

    let failed_period_end = parse_date_key_days(&failed_metric.period_end);
    let expiry_days = if weekly {
        failed_period_end + (tracker.recovery_window_periods as i64) * 7
    } else {
        failed_period_end + tracker.recovery_window_periods as i64
    };

    json!({
        "eligible": true,
        "period_start": failed_metric.period_start,
        "period_end": failed_metric.period_end,
        "expires_on": format_date_key_from_days(expiry_days),
        "action": "repair",
    })
}

fn count_perfect_weeks(metrics: &[EffectiveMetric], tracker: &HabitTracker) -> i64 {
    let closed: Vec<&EffectiveMetric> = metrics
        .iter()
        .filter(|metric| !metric.is_current_period)
        .collect();

    if tracker.target_period == "weekly" {
        return closed
            .iter()
            .filter(|metric| metric.success || metric.used_freeze || metric.used_repair)
            .count() as i64;
    }

    let mut by_week: HashMap<String, Vec<&&EffectiveMetric>> = HashMap::new();
    for metric in &closed {
        let week_start = get_period_window_for_date(&metric.period_start, true).period_start;
        by_week.entry(week_start).or_default().push(metric);
    }

    let mut perfect_weeks = 0;
    for metrics_for_week in by_week.values() {
        if metrics_for_week.len() < 7 {
            continue;
        }
        if metrics_for_week
            .iter()
            .all(|metric| metric.success || metric.used_freeze || metric.used_repair)
        {
            perfect_weeks += 1;
        }
    }
    perfect_weeks
}

struct StreakSummary {
    streak: Value,
    current_period_total: f64,
    total: f64,
    entry_count: f64,
}

fn compute_streak_summary(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> StreakSummary {
    let metrics = build_metric_series(tracker, entries, actions);
    let effective: Vec<&EffectiveMetric> = metrics
        .iter()
        .filter(|metric| !metric.is_current_period)
        .collect();
    let current_metric = metrics.iter().find(|metric| metric.is_current_period);
    let success_metrics: Vec<&EffectiveMetric> = metrics
        .iter()
        .filter(|metric| metric.success || metric.used_freeze || metric.used_repair)
        .collect();
    let freezes_used = actions
        .iter()
        .filter(|action| action.action_type == "freeze")
        .count() as i64;
    let total_closed_periods = effective.len();
    let consistency_rate = if total_closed_periods == 0 {
        0.0
    } else {
        let succeeded = effective
            .iter()
            .filter(|metric| metric.success || metric.used_freeze || metric.used_repair)
            .count() as f64;
        round_to_one((succeeded / total_closed_periods as f64) * 100.0)
    };

    let last_success_date = success_metrics
        .last()
        .map(|metric| Value::String(metric.period_end.clone()))
        .unwrap_or(Value::Null);

    let streak = json!({
        "current_streak": count_current_streak(&metrics),
        "best_streak": count_best_streak(&metrics),
        "last_success_date": last_success_date,
        "freeze_count": json_number(tracker.freeze_allowance),
        "freezes_used": freezes_used,
        "perfect_week_count": count_perfect_weeks(&metrics, tracker),
        "consistency_rate": json_number(consistency_rate),
        "recovery_window": build_recovery_window(tracker, &metrics),
    });

    StreakSummary {
        streak,
        current_period_total: current_metric.map(|metric| metric.total).unwrap_or(0.0),
        total: metrics.iter().map(|metric| metric.total).sum(),
        entry_count: entries.len() as f64,
    }
}

struct MemberSummary {
    member_index: usize,
    total: f64,
    entry_count: f64,
    current_period_total: f64,
    streak: Value,
    latest_value: Option<Value>,
    latest_entry_id: Option<Value>,
    latest_entry_date: Option<Value>,
    latest_occurred_at: Option<Value>,
    latest_values: Option<Value>,
}

fn build_member_summary(
    tracker: &HabitTracker,
    member_index: usize,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> MemberSummary {
    let summary = compute_streak_summary(tracker, entries, actions);
    MemberSummary {
        member_index,
        total: summary.total,
        entry_count: summary.entry_count,
        current_period_total: summary.current_period_total,
        streak: summary.streak,
        latest_value: None,
        latest_entry_id: None,
        latest_entry_date: None,
        latest_occurred_at: None,
        latest_values: None,
    }
}

fn member_summary_json(summary: &MemberSummary, members: &[Member]) -> Value {
    let mut object = Map::new();
    object.insert(
        "member".to_owned(),
        member_json(&members[summary.member_index]),
    );
    object.insert("total".to_owned(), json_number(summary.total));
    object.insert("entry_count".to_owned(), json_number(summary.entry_count));
    object.insert(
        "current_period_total".to_owned(),
        json_number(summary.current_period_total),
    );
    if let Some(value) = &summary.latest_value {
        object.insert("latest_value".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_id {
        object.insert("latest_entry_id".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_date {
        object.insert("latest_entry_date".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_occurred_at {
        object.insert("latest_occurred_at".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_values {
        object.insert("latest_values".to_owned(), value.clone());
    }
    object.insert("streak".to_owned(), summary.streak.clone());
    Value::Object(object)
}

struct FallbackMemberSummary {
    total: f64,
    entry_count: f64,
    current_period_total: f64,
    streak: Value,
    latest_value: Option<Value>,
    latest_entry_id: Option<Value>,
    latest_entry_date: Option<Value>,
    latest_occurred_at: Option<Value>,
    latest_values: Option<Value>,
    member: Value,
}

fn fallback_member_summary_json(summary: &FallbackMemberSummary) -> Value {
    let mut object = Map::new();
    object.insert("member".to_owned(), summary.member.clone());
    object.insert("total".to_owned(), json_number(summary.total));
    object.insert("entry_count".to_owned(), json_number(summary.entry_count));
    object.insert(
        "current_period_total".to_owned(),
        json_number(summary.current_period_total),
    );
    if let Some(value) = &summary.latest_value {
        object.insert("latest_value".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_id {
        object.insert("latest_entry_id".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_entry_date {
        object.insert("latest_entry_date".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_occurred_at {
        object.insert("latest_occurred_at".to_owned(), value.clone());
    }
    if let Some(value) = &summary.latest_values {
        object.insert("latest_values".to_owned(), value.clone());
    }
    object.insert("streak".to_owned(), summary.streak.clone());
    Value::Object(object)
}

fn build_leaderboard(member_summaries: &[MemberSummary], members: &[Member]) -> Vec<Value> {
    let mut indexed: Vec<&MemberSummary> = member_summaries.iter().collect();
    indexed.sort_by(|left, right| {
        let lcs = streak_i64(&left.streak, "current_streak");
        let rcs = streak_i64(&right.streak, "current_streak");
        if rcs != lcs {
            return rcs.cmp(&lcs);
        }
        let lbs = streak_i64(&left.streak, "best_streak");
        let rbs = streak_i64(&right.streak, "best_streak");
        if rbs != lbs {
            return rbs.cmp(&lbs);
        }
        let lcr = streak_f64(&left.streak, "consistency_rate");
        let rcr = streak_f64(&right.streak, "consistency_rate");
        if rcr != lcr {
            return rcr.partial_cmp(&lcr).unwrap_or(std::cmp::Ordering::Equal);
        }
        right
            .current_period_total
            .partial_cmp(&left.current_period_total)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    indexed
        .into_iter()
        .map(|summary| {
            json!({
                "member": member_json(&members[summary.member_index]),
                "current_streak": streak_i64(&summary.streak, "current_streak"),
                "best_streak": streak_i64(&summary.streak, "best_streak"),
                "consistency_rate": json_number(streak_f64(&summary.streak, "consistency_rate")),
                "current_period_total": json_number(summary.current_period_total),
            })
        })
        .collect()
}

fn build_team_summary(member_summaries: &[MemberSummary]) -> Value {
    let active_members = member_summaries
        .iter()
        .filter(|summary| summary.entry_count > 0.0)
        .count();
    let denominator = if active_members > 0 {
        active_members
    } else if !member_summaries.is_empty() {
        member_summaries.len()
    } else {
        1
    } as f64;

    let total_entries: f64 = member_summaries
        .iter()
        .map(|summary| summary.entry_count)
        .sum();
    let total_value: f64 = member_summaries.iter().map(|summary| summary.total).sum();
    let average_consistency = round_to_one(
        member_summaries
            .iter()
            .map(|summary| streak_f64(&summary.streak, "consistency_rate"))
            .sum::<f64>()
            / denominator,
    );
    let top_streak = member_summaries
        .iter()
        .map(|summary| streak_i64(&summary.streak, "current_streak"))
        .max()
        .unwrap_or(0)
        .max(0);

    json!({
        "active_members": active_members,
        "total_entries": json_number(total_entries),
        "total_value": json_number(total_value),
        "average_consistency_rate": json_number(average_consistency),
        "top_streak": top_streak,
    })
}

/// Reproduces `applyLatestStatsToMemberSummary(buildFallbackMemberSummary(...))`.
#[allow(clippy::too_many_arguments)]
fn build_current_member_summary(
    tracker: &HabitTracker,
    members: &[Member],
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
    scope_user_id: Option<&str>,
    member_summaries: &[MemberSummary],
    latest_stat: Option<&LatestStat>,
) -> Option<Value> {
    let scope_user_id = scope_user_id?;

    if let Some(existing_index) = member_summaries
        .iter()
        .position(|summary| members[summary.member_index].user_id == scope_user_id)
    {
        let mut summary = clone_member_summary(&member_summaries[existing_index]);
        apply_latest_stats(&mut summary, latest_stat);
        return Some(member_summary_json(&summary, members));
    }

    // Fallback "You" summary, only if the scope user has entries or actions.
    let member_entries: Vec<&HabitEntry> = entries
        .iter()
        .copied()
        .filter(|entry| entry.user_id == scope_user_id)
        .collect();
    let member_actions: Vec<&StreakAction> = actions
        .iter()
        .copied()
        .filter(|action| action.user_id == scope_user_id)
        .collect();
    if member_entries.is_empty() && member_actions.is_empty() {
        return None;
    }

    let summary = compute_streak_summary(tracker, &member_entries, &member_actions);
    let mut fallback = FallbackMemberSummary {
        total: summary.total,
        entry_count: summary.entry_count,
        current_period_total: summary.current_period_total,
        streak: summary.streak,
        latest_value: None,
        latest_entry_id: None,
        latest_entry_date: None,
        latest_occurred_at: None,
        latest_values: None,
        member: json!({
            "user_id": scope_user_id,
            "workspace_user_id": Value::Null,
            "display_name": "You",
            "email": Value::Null,
            "avatar_url": Value::Null,
        }),
    };
    apply_latest_stats_fallback(&mut fallback, latest_stat);
    Some(fallback_member_summary_json(&fallback))
}

fn clone_member_summary(summary: &MemberSummary) -> MemberSummary {
    MemberSummary {
        member_index: summary.member_index,
        total: summary.total,
        entry_count: summary.entry_count,
        current_period_total: summary.current_period_total,
        streak: summary.streak.clone(),
        latest_value: summary.latest_value.clone(),
        latest_entry_id: summary.latest_entry_id.clone(),
        latest_entry_date: summary.latest_entry_date.clone(),
        latest_occurred_at: summary.latest_occurred_at.clone(),
        latest_values: summary.latest_values.clone(),
    }
}

fn apply_latest_stats(summary: &mut MemberSummary, latest_stat: Option<&LatestStat>) {
    let Some(stat) = latest_stat else {
        return;
    };
    summary.latest_value = Some(opt_f64_value(stat.latest_primary_value));
    summary.latest_entry_id = Some(opt_str_value(stat.latest_entry_id.as_deref()));
    summary.latest_entry_date = Some(opt_str_value(stat.latest_entry_date.as_deref()));
    summary.latest_occurred_at = Some(opt_str_value(stat.latest_occurred_at.as_deref()));
    summary.latest_values = Some(latest_values_value(stat));
}

fn apply_latest_stats_fallback(
    summary: &mut FallbackMemberSummary,
    latest_stat: Option<&LatestStat>,
) {
    let Some(stat) = latest_stat else {
        return;
    };
    summary.latest_value = Some(opt_f64_value(stat.latest_primary_value));
    summary.latest_entry_id = Some(opt_str_value(stat.latest_entry_id.as_deref()));
    summary.latest_entry_date = Some(opt_str_value(stat.latest_entry_date.as_deref()));
    summary.latest_occurred_at = Some(opt_str_value(stat.latest_occurred_at.as_deref()));
    summary.latest_values = Some(latest_values_value(stat));
}

fn latest_values_value(stat: &LatestStat) -> Value {
    match &stat.latest_values {
        Some(value) if !value.is_null() => normalize_entry_values(value),
        _ => Value::Null,
    }
}

/// Port of `aggregateMetricsForTeam`: sum each member's metric series across the
/// shared window list (the windows come from an empty-entry series).
fn aggregate_metrics_for_team(
    tracker: &HabitTracker,
    entries: &[&HabitEntry],
    actions: &[&StreakAction],
) -> Vec<Value> {
    let windows = build_metric_series(tracker, &[], &[]);

    // Group entries / actions by user.
    let mut entries_by_user: HashMap<&str, Vec<&HabitEntry>> = HashMap::new();
    for entry in entries {
        entries_by_user
            .entry(entry.user_id.as_str())
            .or_default()
            .push(entry);
    }
    let mut actions_by_user: HashMap<&str, Vec<&StreakAction>> = HashMap::new();
    for action in actions {
        actions_by_user
            .entry(action.user_id.as_str())
            .or_default()
            .push(action);
    }

    let mut totals: HashMap<String, (f64, f64)> = HashMap::new();
    for (user_id, member_entries) in &entries_by_user {
        let member_actions = actions_by_user.get(user_id).cloned().unwrap_or_default();
        let metrics = build_metric_series(tracker, member_entries, &member_actions);
        for metric in metrics {
            let current = totals.entry(metric.period_start).or_insert((0.0, 0.0));
            current.0 += metric.total;
            current.1 += metric.entry_count;
        }
    }

    windows
        .into_iter()
        .map(|window| {
            let (total, entry_count) = totals
                .get(&window.period_start)
                .copied()
                .unwrap_or((0.0, 0.0));
            json!({
                "period_start": window.period_start,
                "period_end": window.period_end,
                "total": json_number(total),
                "success": false,
                "used_freeze": false,
                "used_repair": false,
                "entry_count": json_number(entry_count),
            })
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Workspace normalization + access (COPIED from workspace_habits_access.rs)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved_ws_id = resolve_workspace_id(raw_ws_id);

    if resolved_ws_id == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved_ws_id) {
        let handle = raw_ws_id.trim().to_lowercase();
        if !is_direct_workspace_lookup_identifier(&handle) {
            return Ok(resolved_ws_id);
        }

        if let Some(workspace_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(workspace_id);
        }
        if let Some(workspace_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(workspace_id);
        }
    }

    Ok(resolved_ws_id)
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", "eq.MEMBER".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id)
        .ok_or(())
}

async fn workspace_id_by_handle(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
    access_token: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn workspace_id_by_handle_service_role(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    handle: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            ("select", "id".to_owned()),
            ("handle", format!("eq.{handle}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Ok(None);
    }
    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn habits_workspace_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_HABITS_SECRET}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .as_deref()
        == Some("true"))
}

async fn send_caller_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    access_token: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

async fn send_service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

fn is_direct_workspace_lookup_identifier(identifier: &str) -> bool {
    let normalized = identifier.trim().to_lowercase();
    normalized == PERSONAL_WORKSPACE_SLUG
        || normalized == ROOT_WORKSPACE_ID
        || normalized == INTERNAL_WORKSPACE_SLUG
        || is_workspace_uuid_literal(&normalized)
        || is_workspace_handle(&normalized)
}

fn is_workspace_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, character)| {
        let is_edge = index == 0 || index + 1 == length;
        character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || (!is_edge && matches!(character, '_' | '-'))
    })
}

/// Mirror of `uuid.validate(trackerId)`: case-insensitive canonical 8-4-4-4-12
/// hex form.
fn is_uuid(value: &str) -> bool {
    is_workspace_uuid_literal(value)
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(string) => string.clone(),
        Value::Null => String::new(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        other => other.to_string(),
    }
}

fn value_to_finite_number(value: &Value) -> Option<f64> {
    let number = match value {
        Value::Number(number) => number.as_f64(),
        Value::String(string) => string.trim().parse::<f64>().ok(),
        Value::Bool(flag) => Some(if *flag { 1.0 } else { 0.0 }),
        Value::Null => Some(0.0),
        _ => None,
    }?;
    number.is_finite().then_some(number)
}

fn number_or(value: &Value, fallback: f64) -> f64 {
    match value {
        Value::Null => fallback,
        other => value_to_finite_number(other).unwrap_or(fallback),
    }
}

fn enum_or(value: &Value, allowed: &[&str], fallback: &str) -> String {
    match value.as_str() {
        Some(string) if allowed.contains(&string) => string.to_owned(),
        _ => fallback.to_owned(),
    }
}

fn value_string_length(value: &Value) -> usize {
    match value {
        Value::String(string) => string.chars().count(),
        Value::Null => 0,
        other => other.to_string().chars().count(),
    }
}

fn json_number(value: f64) -> Value {
    if value.is_finite() {
        if value.fract() == 0.0 && value.abs() < 9_007_199_254_740_992.0 {
            Value::Number((value as i64).into())
        } else {
            serde_json::Number::from_f64(value)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        }
    } else {
        Value::Null
    }
}

fn round_to_one(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn opt_f64_value(value: Option<f64>) -> Value {
    match value {
        Some(number) => json_number(number),
        None => Value::Null,
    }
}

fn opt_str_value(value: Option<&str>) -> Value {
    match value {
        Some(string) => Value::String(string.to_owned()),
        None => Value::Null,
    }
}

fn streak_i64(streak: &Value, key: &str) -> i64 {
    streak.get(key).and_then(Value::as_i64).unwrap_or(0)
}

fn streak_f64(streak: &Value, key: &str) -> f64 {
    streak.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}
