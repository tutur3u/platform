//! Port of the legacy Next.js route
//! `/api/v1/workspaces/[wsId]/habit-trackers/[trackerId]/entries`.
//!
//! Only the GET method is migrated here. The legacy route also defines POST
//! (create entry); that method is intentionally NOT handled so the worker
//! falls through to the still-active Next.js route for it.
//!
//! GET returns `{ "entries": [...] }`, where `entries` mirrors
//! `getHabitTrackerDetail(...).entries`: all entries for the tracker (across all
//! members), normalized like `mapEntryRow`/`normalizeEntryValues`, sorted by
//! `occurred_at` descending, truncated to 50, each augmented with a `member`
//! field resolved from the workspace's linked members (or `null`).

use serde::{Deserialize, Serialize};
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
const PATH_SUFFIX: &str = "/entries";
const HABIT_TRACKERS_SEGMENT: &str = "/habit-trackers/";

const MAX_RECENT_ENTRIES: usize = 50;

// Error messages copied verbatim from the legacy HabitTrackerError usages so the
// JSON `{ "error": ... }` payloads match exactly.
const MSG_UNAUTHORIZED: &str = "Please sign in to use habit trackers";
const MSG_MEMBERSHIP_LOOKUP_FAILED: &str = "Failed to verify workspace membership";
const MSG_ACCESS_DENIED: &str = "Workspace access denied";
const MSG_NOT_FOUND: &str = "Not found";
const MSG_INVALID_TRACKER_ID: &str = "Invalid habit tracker ID";
const MSG_TRACKER_NOT_FOUND: &str = "Habit tracker not found";
const MSG_LOAD_TRACKER_FAILED: &str = "Failed to load habit tracker";
const MSG_LOAD_MEMBERS_FAILED: &str = "Failed to load workspace members";
const MSG_LOAD_USERS_FAILED: &str = "Failed to load workspace users";
const MSG_LOAD_ENTRIES_FAILED: &str = "Failed to load habit tracker entries";

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

#[derive(Deserialize)]
struct TrackerIdRow {
    #[allow(dead_code)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct LinkedUserRow {
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

// Raw entry row; values is preserved as arbitrary JSON for normalization.
#[derive(Deserialize)]
struct EntryRow {
    id: Option<Value>,
    ws_id: Option<Value>,
    tracker_id: Option<Value>,
    user_id: Option<Value>,
    entry_kind: Option<String>,
    entry_date: Option<String>,
    occurred_at: Option<String>,
    values: Option<Value>,
    primary_value: Option<Value>,
    note: Option<Value>,
    tags: Option<Value>,
    created_by: Option<Value>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Clone, Serialize)]
struct MemberJson {
    user_id: String,
    workspace_user_id: Option<String>,
    display_name: String,
    email: Option<String>,
    avatar_url: Option<String>,
}

/// One of the typed errors used internally to short-circuit with a JSON error
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

pub(crate) async fn handle_workspaces_habit_trackers_trackerid_entries_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, tracker_id) = parse_path(request.path)?;

    Some(match request.method {
        "GET" => match get_entries_response(config, request, raw_ws_id, tracker_id, outbound).await
        {
            Ok(response) => response,
            Err(err) => error_response(err.status, err.message),
        },
        // Every non-migrated method (POST, etc.) must fall through to the
        // still-active Next.js route, NOT return a 405.
        _ => return None,
    })
}

async fn get_entries_response(
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

    // Auth: resolve the Supabase user from the access token.
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

    // normalizeWorkspaceId(wsId, supabase)
    let resolved_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
            .map_err(|()| HabitError::new(500, MSG_MEMBERSHIP_LOOKUP_FAILED))?;

    // verifyWorkspaceMembership -> requires MEMBER, else 403 / 500 on lookup failure.
    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return Err(HabitError::new(403, MSG_ACCESS_DENIED)),
        Err(()) => return Err(HabitError::new(500, MSG_MEMBERSHIP_LOOKUP_FAILED)),
    }

    // isHabitsEnabled -> 404 "Not found" when disabled.
    if !habits_workspace_enabled(contact_data, outbound, &resolved_ws_id)
        .await
        .unwrap_or(false)
    {
        return Err(HabitError::new(404, MSG_NOT_FOUND));
    }

    // getHabitTrackerDetail: tracker must exist (and not be archived), else 404.
    match tracker_exists(contact_data, outbound, &resolved_ws_id, tracker_id).await {
        Ok(true) => {}
        Ok(false) => return Err(HabitError::new(404, MSG_TRACKER_NOT_FOUND)),
        Err(()) => return Err(HabitError::new(500, MSG_LOAD_TRACKER_FAILED)),
    }

    // Members list (for attaching `member` to each entry).
    let members = list_members(contact_data, outbound, &resolved_ws_id).await?;

    // Entries for this tracker (all members).
    let entries_raw = list_tracker_entries(contact_data, outbound, &resolved_ws_id, tracker_id)
        .await
        .map_err(|()| HabitError::new(500, MSG_LOAD_ENTRIES_FAILED))?;

    let entries = build_recent_entries(entries_raw, &members);

    Ok(no_store_response(json_response(
        200,
        json!({ "entries": entries }),
    )))
}

// ---------------------------------------------------------------------------
// Workspace identifier normalization + access checks (mirrors
// workspace_habits_access.rs, which is the canonical reference for this surface).
// ---------------------------------------------------------------------------

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_rest_request(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

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

// ---------------------------------------------------------------------------
// Tracker existence + entries + members
// ---------------------------------------------------------------------------

async fn tracker_exists(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tracker_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_habit_trackers",
        &[
            ("select", "id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{tracker_id}")),
            ("archived_at", "is.null".to_owned()),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(!response
        .json::<Vec<TrackerIdRow>>()
        .map_err(|_| ())?
        .is_empty())
}

async fn list_tracker_entries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    tracker_id: &str,
) -> Result<Vec<EntryRow>, ()> {
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
    let response = send_service_role_rest_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<EntryRow>>().map_err(|_| ())
}

async fn list_members(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<Vec<MemberJson>, HabitError> {
    // workspace_user_linked_users
    let Some(links_url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "platform_user_id,virtual_user_id".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(HabitError::new(500, MSG_LOAD_MEMBERS_FAILED));
    };
    let links_response = send_service_role_rest_request(contact_data, outbound, &links_url)
        .await
        .map_err(|()| HabitError::new(500, MSG_LOAD_MEMBERS_FAILED))?;
    if !(200..300).contains(&links_response.status) {
        return Err(HabitError::new(500, MSG_LOAD_MEMBERS_FAILED));
    }
    let links = links_response
        .json::<Vec<LinkedUserRow>>()
        .map_err(|_| HabitError::new(500, MSG_LOAD_MEMBERS_FAILED))?;

    // Unique virtual_user_ids (insertion order), falling back to the zero-uuid
    // when empty to mirror the legacy `.in('id', [...])` query.
    let mut virtual_user_ids: Vec<String> = Vec::new();
    for link in &links {
        if let Some(id) = link.virtual_user_id.as_deref() {
            if !virtual_user_ids.iter().any(|existing| existing == id) {
                virtual_user_ids.push(id.to_owned());
            }
        }
    }
    let lookup_ids = if virtual_user_ids.is_empty() {
        vec![ROOT_WORKSPACE_ID.to_owned()]
    } else {
        virtual_user_ids
    };

    let in_filter = format!("in.({})", lookup_ids.join(","));
    let Some(users_url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "id,display_name,email,avatar_url".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", in_filter),
        ],
    ) else {
        return Err(HabitError::new(500, MSG_LOAD_USERS_FAILED));
    };
    let users_response = send_service_role_rest_request(contact_data, outbound, &users_url)
        .await
        .map_err(|()| HabitError::new(500, MSG_LOAD_USERS_FAILED))?;
    if !(200..300).contains(&users_response.status) {
        return Err(HabitError::new(500, MSG_LOAD_USERS_FAILED));
    }
    let workspace_users = users_response
        .json::<Vec<WorkspaceUserRow>>()
        .map_err(|_| HabitError::new(500, MSG_LOAD_USERS_FAILED))?;

    // Build a map keyed by workspace user id.
    let mut members: Vec<MemberJson> = Vec::new();
    for link in &links {
        let (Some(platform_user_id), Some(virtual_user_id)) = (
            link.platform_user_id.as_deref(),
            link.virtual_user_id.as_deref(),
        ) else {
            continue;
        };
        let Some(workspace_user) = workspace_users
            .iter()
            .find(|user| user.id.as_deref() == Some(virtual_user_id))
        else {
            continue;
        };

        let display_name = workspace_user
            .display_name
            .as_deref()
            .filter(|value| !value.is_empty())
            .or_else(|| {
                workspace_user
                    .email
                    .as_deref()
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or(platform_user_id)
            .to_owned();

        members.push(MemberJson {
            user_id: platform_user_id.to_owned(),
            workspace_user_id: workspace_user.id.clone(),
            display_name,
            email: workspace_user.email.clone(),
            avatar_url: workspace_user.avatar_url.clone(),
        });
    }

    // Sort by display_name (locale-naive; matches `localeCompare` closely enough
    // for ASCII display names, which is the dominant case).
    members.sort_by(|left, right| left.display_name.cmp(&right.display_name));

    Ok(members)
}

// ---------------------------------------------------------------------------
// Entry mapping / normalization (mirrors mapEntryRow + normalizeEntryValues)
// ---------------------------------------------------------------------------

fn build_recent_entries(entries_raw: Vec<EntryRow>, members: &[MemberJson]) -> Vec<Value> {
    // Map each raw row to its normalized JSON form, keeping the user_id and a
    // parsed occurred_at for sorting.
    struct MappedEntry {
        value: Map<String, Value>,
        user_id: String,
        occurred_at: String,
    }

    let mut mapped: Vec<MappedEntry> = entries_raw
        .into_iter()
        .map(|row| {
            let (object, user_id, occurred_at) = map_entry_row(row);
            MappedEntry {
                value: object,
                user_id,
                occurred_at,
            }
        })
        .collect();

    // Sort by occurred_at descending. occurred_at is an ISO timestamp string,
    // for which lexicographic descending order matches chronological descending
    // order. JS uses Date.getTime(), but ISO-8601 (UTC, fixed precision from
    // Postgres) sorts identically lexicographically for valid timestamps.
    mapped.sort_by(|left, right| right.occurred_at.cmp(&left.occurred_at));
    mapped.truncate(MAX_RECENT_ENTRIES);

    mapped
        .into_iter()
        .map(|entry| {
            let mut object = entry.value;
            let member = members
                .iter()
                .find(|member| member.user_id == entry.user_id)
                .cloned();
            object.insert(
                "member".to_owned(),
                match member {
                    Some(member) => serde_json::to_value(member).unwrap_or(Value::Null),
                    None => Value::Null,
                },
            );
            Value::Object(object)
        })
        .collect()
}

/// Mirror of `mapEntryRow`. Returns the JSON object plus the user_id and
/// occurred_at used by the caller for grouping/sorting.
fn map_entry_row(row: EntryRow) -> (Map<String, Value>, String, String) {
    let id = stringify_value(row.id.as_ref());
    let ws_id = stringify_value(row.ws_id.as_ref());
    let tracker_id = stringify_value(row.tracker_id.as_ref());
    let user_id = stringify_value(row.user_id.as_ref());

    let entry_kind = if row.entry_kind.as_deref() == Some("daily_summary") {
        "daily_summary"
    } else {
        "event_log"
    };

    let entry_date = row
        .entry_date
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    let occurred_at = row
        .occurred_at
        .filter(|value| !value.is_empty())
        .unwrap_or_default();

    let values = normalize_entry_values(row.values.as_ref());

    let primary_value = match row.primary_value {
        Some(Value::Number(number)) => Value::Number(number),
        _ => Value::Null,
    };

    let note = match row.note {
        Some(Value::String(text)) => Value::String(text),
        _ => Value::Null,
    };

    let tags = match row.tags {
        Some(Value::Array(items)) => {
            Value::Array(items.into_iter().filter(|item| item.is_string()).collect())
        }
        _ => Value::Array(Vec::new()),
    };

    let created_by = match row.created_by {
        Some(Value::String(text)) => Value::String(text),
        _ => Value::Null,
    };

    let created_at = row
        .created_at
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    let updated_at = row
        .updated_at
        .filter(|value| !value.is_empty())
        .unwrap_or_default();

    let mut object = Map::new();
    object.insert("id".to_owned(), Value::String(id));
    object.insert("ws_id".to_owned(), Value::String(ws_id));
    object.insert("tracker_id".to_owned(), Value::String(tracker_id));
    object.insert("user_id".to_owned(), Value::String(user_id.clone()));
    object.insert(
        "entry_kind".to_owned(),
        Value::String(entry_kind.to_owned()),
    );
    object.insert("entry_date".to_owned(), Value::String(entry_date));
    object.insert("occurred_at".to_owned(), Value::String(occurred_at.clone()));
    object.insert("values".to_owned(), Value::Object(values));
    object.insert("primary_value".to_owned(), primary_value);
    object.insert("note".to_owned(), note);
    object.insert("tags".to_owned(), tags);
    object.insert("created_by".to_owned(), created_by);
    object.insert("created_at".to_owned(), Value::String(created_at));
    object.insert("updated_at".to_owned(), Value::String(updated_at));

    (object, user_id, occurred_at)
}

/// Mirror of `normalizeEntryValues`: keep null/bool/number/string scalars; for
/// any other (object/array) value, attempt to normalize it as an array of
/// exercise blocks and keep it only when at least one valid block results.
fn normalize_entry_values(input: Option<&Value>) -> Map<String, Value> {
    let Some(Value::Object(object)) = input else {
        return Map::new();
    };

    let mut normalized = Map::new();
    for (key, value) in object {
        match value {
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
                normalized.insert(key.clone(), value.clone());
            }
            _ => {
                let blocks = normalize_exercise_blocks(value);
                if !blocks.is_empty() {
                    normalized.insert(key.clone(), Value::Array(blocks));
                }
            }
        }
    }

    normalized
}

/// Mirror of `normalizeExerciseBlocks`.
fn normalize_exercise_blocks(input: &Value) -> Vec<Value> {
    let Value::Array(items) = input else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let Value::Object(block) = item else {
                return None;
            };

            let exercise_name = block
                .get("exercise_name")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_owned();

            let sets = number_or_zero(block.get("sets"));
            let reps = number_or_zero(block.get("reps"));

            let weight = match block.get("weight") {
                Some(Value::Number(number)) if number.as_f64().is_some_and(f64::is_finite) => {
                    Value::Number(number.clone())
                }
                _ => Value::Null,
            };

            let unit = match block.get("unit") {
                Some(Value::String(text)) => Value::String(text.clone()),
                _ => Value::Null,
            };
            let notes = match block.get("notes") {
                Some(Value::String(text)) => Value::String(text.clone()),
                _ => Value::Null,
            };

            // Filter: name non-empty, sets/reps finite and > 0.
            if exercise_name.is_empty()
                || !sets.is_finite()
                || sets <= 0.0
                || !reps.is_finite()
                || reps <= 0.0
            {
                return None;
            }

            let mut normalized = Map::new();
            normalized.insert("exercise_name".to_owned(), Value::String(exercise_name));
            normalized.insert("sets".to_owned(), number_value(sets));
            normalized.insert("reps".to_owned(), number_value(reps));
            normalized.insert("weight".to_owned(), weight);
            normalized.insert("unit".to_owned(), unit);
            normalized.insert("notes".to_owned(), notes);
            Some(Value::Object(normalized))
        })
        .collect()
}

/// Mirror of JS `Number(block.x ?? 0)` for sets/reps. Numbers pass through,
/// numeric strings parse, null/missing -> 0, everything else -> NaN (which the
/// downstream finite check rejects).
fn number_or_zero(value: Option<&Value>) -> f64 {
    match value {
        None | Some(Value::Null) => 0.0,
        Some(Value::Number(number)) => number.as_f64().unwrap_or(f64::NAN),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                0.0
            } else {
                trimmed.parse::<f64>().unwrap_or(f64::NAN)
            }
        }
        Some(Value::Bool(value)) => {
            if *value {
                1.0
            } else {
                0.0
            }
        }
        _ => f64::NAN,
    }
}

fn number_value(value: f64) -> Value {
    serde_json::Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or(Value::Null)
}

/// Mirror of `String(row.x)` for id-like columns: stringify whatever JSON value
/// the row carried.
fn stringify_value(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(boolean)) => boolean.to_string(),
        Some(Value::Null) | None => "null".to_owned(),
        Some(other) => other.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Outbound helpers (copied from the workspace_habits_access reference; kept
// file-local to avoid touching shared modules)
// ---------------------------------------------------------------------------

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

// ---------------------------------------------------------------------------
// Path parsing + small identifier helpers
// ---------------------------------------------------------------------------

/// Match `/api/v1/workspaces/{wsId}/habit-trackers/{trackerId}/entries` and
/// extract (wsId, trackerId). Both segments must be non-empty and contain no
/// further slashes.
fn parse_path(path: &str) -> Option<(&str, &str)> {
    let inner = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    let (ws_id, rest) = inner.split_once(HABIT_TRACKERS_SEGMENT)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if rest.is_empty() || rest.contains('/') {
        return None;
    }

    Some((ws_id, rest))
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
    value.trim().len() == 36
        && value
            .trim()
            .chars()
            .enumerate()
            .all(|(index, value)| match index {
                8 | 13 | 18 | 23 => value == '-',
                _ => value.is_ascii_hexdigit(),
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
/// hex form. (workspace UUID literal is uppercase-insensitive too.)
fn is_uuid(value: &str) -> bool {
    is_workspace_uuid_literal(value)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
