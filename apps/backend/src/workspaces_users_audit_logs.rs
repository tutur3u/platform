use std::collections::{BTreeSet, HashMap};

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const AUDIT_LOGS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const AUDIT_LOGS_PATH_SUFFIX: &str = "/users/audit-logs";
const MANAGE_AUDIT_LOGS_PERMISSION: &str = "manage_workspace_audit_logs";
const VIEW_PRIVATE_INFO_PERMISSION: &str = "view_users_private_info";
const LIST_AUDIT_FEED_RPC: &str = "list_workspace_user_audit_feed";

const INVALID_PARAMS_MESSAGE: &str = "Invalid audit log query parameters";
const NOT_FOUND_MESSAGE: &str = "Not found";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const ERROR_FETCHING_MESSAGE: &str = "Error fetching audit logs";

const VALID_EVENT_KINDS: &[&str] = &[
    "all",
    "created",
    "updated",
    "archived",
    "reactivated",
    "archive_until_changed",
    "deleted",
];
const VALID_SOURCES: &[&str] = &["all", "live", "backfilled"];

const PRIVATE_AUDIT_FIELDS: &[&str] = &["note"];
const SUMMARY_HIDDEN_FIELDS: &[&str] = &["avatar_url", "created_at", "deleted_at", "updated_at"];

#[derive(Deserialize)]
struct AuditFeedRow {
    #[serde(default)]
    audit_record_id: i64,
    #[serde(default)]
    event_kind: Option<String>,
    #[serde(default)]
    occurred_at: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    affected_user_id: Option<String>,
    #[serde(default)]
    affected_user_name: Option<String>,
    #[serde(default)]
    affected_user_email: Option<String>,
    #[serde(default)]
    actor_auth_uid: Option<String>,
    #[serde(default)]
    actor_workspace_user_id: Option<String>,
    #[serde(default)]
    actor_id: Option<String>,
    #[serde(default)]
    actor_name: Option<String>,
    #[serde(default)]
    actor_email: Option<String>,
    #[serde(default)]
    changed_fields: Option<Vec<String>>,
    #[serde(default)]
    before: Option<Value>,
    #[serde(default)]
    after: Option<Value>,
    #[serde(default)]
    total_count: Option<i64>,
}

#[derive(Deserialize)]
struct WorkspaceUserNoteRow {
    id: Option<String>,
    note: Option<String>,
}

struct ParsedParams {
    start: String,
    end: String,
    event_kind: Option<String>,
    source: Option<String>,
    affected_user_query: Option<String>,
    actor_query: Option<String>,
    offset: i64,
    limit: i64,
}

pub(crate) async fn handle_workspaces_users_audit_logs_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let ws_id = audit_logs_ws_id(request.path)?;

    Some(match request.method {
        "GET" => audit_logs_response(config, request, ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn audit_logs_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(params) = parse_query_params(request.url) else {
        return message_response(400, INVALID_PARAMS_MESSAGE);
    };

    // getPermissions + manage_workspace_audit_logs check.
    let manage_authorization = match authorize_workspace_permission(
        &config.contact_data,
        request,
        raw_ws_id,
        MANAGE_AUDIT_LOGS_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized)
        | Err(WorkspacePermissionAuthorizationError::NotFound) => {
            // Legacy: getPermissions returning falsy -> 404 { error: 'Not found' }.
            return error_response(404, NOT_FOUND_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            // Legacy: missing manage_workspace_audit_logs -> 403 { message: 'Unauthorized' }.
            return message_response(403, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, ERROR_FETCHING_MESSAGE);
        }
    };

    let ws_id = manage_authorization.ws_id;

    // canViewPrivateInfo = containsPermission('view_users_private_info').
    let can_view_private_info = match authorize_workspace_permission(
        &config.contact_data,
        request,
        &ws_id,
        VIEW_PRIVATE_INFO_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(_) => true,
        Err(WorkspacePermissionAuthorizationError::Forbidden)
        | Err(WorkspacePermissionAuthorizationError::NotFound)
        | Err(WorkspacePermissionAuthorizationError::Unauthorized) => false,
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, ERROR_FETCHING_MESSAGE);
        }
    };

    match list_audit_log_events(
        &config.contact_data,
        outbound,
        &ws_id,
        &params,
        can_view_private_info,
    )
    .await
    {
        Ok(value) => no_store_response(json_response(200, value)),
        Err(()) => message_response(500, ERROR_FETCHING_MESSAGE),
    }
}

async fn list_audit_log_events(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    params: &ParsedParams,
    can_view_private_info: bool,
) -> Result<Value, ()> {
    let event_kind = resolve_filter(params.event_kind.as_deref(), VALID_EVENT_KINDS, "all");
    let source = resolve_filter(params.source.as_deref(), VALID_SOURCES, "all");

    let rpc_url = contact_data.rpc_url(LIST_AUDIT_FEED_RPC).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let body = json!({
        "p_ws_id": ws_id,
        "p_start": params.start,
        "p_end": params.end,
        "p_event_kind": event_kind,
        "p_source": source,
        "p_affected_user_query": trimmed_or_null(params.affected_user_query.as_deref()),
        "p_actor_query": trimmed_or_null(params.actor_query.as_deref()),
        "p_limit": params.limit,
        "p_offset": params.offset,
    });
    let body = serde_json::to_string(&body).map_err(|_| ())?;

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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<AuditFeedRow>>().map_err(|_| ())?;
    // Legacy toCount(rows[0]?.total_count): finite number or 0.
    let count = rows.first().and_then(|row| row.total_count).unwrap_or(0);

    let mut events: Vec<Value> = rows.iter().map(map_feed_row_to_event).collect();

    attach_archival_notes(
        contact_data,
        outbound,
        ws_id,
        &mut events,
        can_view_private_info,
    )
    .await?;

    Ok(json!({
        "count": count,
        "data": events,
    }))
}

fn map_feed_row_to_event(row: &AuditFeedRow) -> Value {
    let changed_fields: Vec<String> = row.changed_fields.clone().unwrap_or_default();
    let before_record = as_record(row.before.as_ref());
    let after_record = as_record(row.after.as_ref());
    let event_kind = row.event_kind.clone().unwrap_or_default();

    let archival_note = if is_archive_event(&event_kind) {
        normalize_archival_note(after_record.get("note"))
    } else {
        None
    };

    let affected_name = row.affected_user_name.clone();
    let affected_email = row.affected_user_email.clone();
    let summary_name = affected_name.clone().or_else(|| affected_email.clone());

    let field_changes = build_field_changes(&changed_fields, &before_record, &after_record);

    let before_out = normalize_record(&before_record);
    let after_out = normalize_record(&after_record);

    json!({
        "auditRecordId": row.audit_record_id,
        "eventKind": event_kind,
        "summary": build_summary(&event_kind, summary_name.as_deref(), &changed_fields),
        "changedFields": changed_fields,
        "fieldChanges": field_changes,
        "before": before_out,
        "after": after_out,
        "affectedUser": {
            "id": row.affected_user_id.clone().unwrap_or_default(),
            "name": affected_name,
            "email": affected_email,
        },
        "actor": {
            "authUid": row.actor_auth_uid,
            "workspaceUserId": row.actor_workspace_user_id,
            "id": row.actor_id,
            "name": row.actor_name,
            "email": row.actor_email,
        },
        "occurredAt": row.occurred_at.clone().unwrap_or_default(),
        "source": row.source.clone().unwrap_or_default(),
        "archivalNote": archival_note,
    })
}

async fn attach_archival_notes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    events: &mut [Value],
    can_view_private_info: bool,
) -> Result<(), ()> {
    if !can_view_private_info {
        for event in events.iter_mut() {
            strip_private_audit_fields(event);
        }
        return Ok(());
    }

    let missing_note_user_ids: Vec<String> = {
        let mut seen = BTreeSet::new();
        let mut ids = Vec::new();
        for event in events.iter() {
            if !is_archive_event(event_kind_of(event)) {
                continue;
            }
            if normalize_archival_note(event.get("archivalNote")).is_some() {
                continue;
            }
            let Some(id) = affected_user_id_of(event) else {
                continue;
            };
            if seen.insert(id.to_owned()) {
                ids.push(id.to_owned());
            }
        }
        ids
    };

    let note_by_user_id = if missing_note_user_ids.is_empty() {
        HashMap::new()
    } else {
        fetch_workspace_user_notes(contact_data, outbound, ws_id, &missing_note_user_ids).await?
    };

    for event in events.iter_mut() {
        let kind = event_kind_of(event).to_owned();
        if !is_archive_event(&kind) {
            set_field(event, "archivalNote", Value::Null);
            continue;
        }

        let existing = normalize_archival_note(event.get("archivalNote"));
        let resolved = existing
            .or_else(|| {
                affected_user_id_of(event)
                    .and_then(|id| note_by_user_id.get(id))
                    .cloned()
                    .flatten()
            })
            .map(Value::String)
            .unwrap_or(Value::Null);
        set_field(event, "archivalNote", resolved);
    }

    Ok(())
}

async fn fetch_workspace_user_notes(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_ids: &[String],
) -> Result<HashMap<String, Option<String>>, ()> {
    let in_list = format!("in.({})", user_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "id,note".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", in_list),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response
        .json::<Vec<WorkspaceUserNoteRow>>()
        .map_err(|_| ())?;
    let mut map = HashMap::new();
    for row in rows {
        if let Some(id) = row.id {
            map.insert(id, normalize_archival_note_str(row.note.as_deref()));
        }
    }

    Ok(map)
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

fn strip_private_audit_fields(event: &mut Value) {
    set_field(event, "archivalNote", Value::Null);

    if let Some(changed) = event.get_mut("changedFields").and_then(Value::as_array_mut) {
        changed.retain(|value| !is_private_field(value.as_str()));
    }

    if let Some(field_changes) = event.get_mut("fieldChanges").and_then(Value::as_array_mut) {
        field_changes
            .retain(|change| !is_private_field(change.get("field").and_then(Value::as_str)));
    }

    omit_record_keys(event, "before");
    omit_record_keys(event, "after");
}

fn omit_record_keys(event: &mut Value, key: &str) {
    if let Some(Value::Object(map)) = event.get_mut(key) {
        for field in PRIVATE_AUDIT_FIELDS {
            map.remove(*field);
        }
    }
}

fn build_field_changes(
    changed_fields: &[String],
    before_record: &Map<String, Value>,
    after_record: &Map<String, Value>,
) -> Value {
    let changes: Vec<Value> = changed_fields
        .iter()
        .map(|field| {
            json!({
                "field": field,
                "label": humanize_audit_field(field),
                "before": normalize_audit_field_value(before_record.get(field)),
                "after": normalize_audit_field_value(after_record.get(field)),
            })
        })
        .collect();

    Value::Array(changes)
}

fn normalize_record(record: &Map<String, Value>) -> Value {
    let mut out = Map::new();
    for (key, value) in record {
        out.insert(
            key.clone(),
            match normalize_audit_field_value(Some(value)) {
                Some(text) => Value::String(text),
                None => Value::Null,
            },
        );
    }
    Value::Object(out)
}

fn build_summary(
    event_kind: &str,
    affected_user_name: Option<&str>,
    changed_fields: &[String],
) -> String {
    let label = affected_user_name
        .filter(|name| !name.is_empty())
        .unwrap_or("Unknown user");

    match event_kind {
        "created" => format!("Created {label}"),
        "archived" => format!("Archived {label}"),
        "reactivated" => format!("Reactivated {label}"),
        "archive_until_changed" => format!("Updated archive timing for {label}"),
        "deleted" => format!("Deleted {label}"),
        _ => format!(
            "Updated {} for {label}",
            summarize_field_list(changed_fields)
        ),
    }
}

fn summarize_field_list(fields: &[String]) -> String {
    let visible: Vec<&String> = fields
        .iter()
        .filter(|field| !SUMMARY_HIDDEN_FIELDS.contains(&field.as_str()))
        .collect();

    match visible.len() {
        0 => "record details".to_owned(),
        1 => humanize_audit_field(visible[0]),
        2 => format!(
            "{} and {}",
            humanize_audit_field(visible[0]),
            humanize_audit_field(visible[1])
        ),
        len => format!(
            "{} +{} more fields",
            humanize_audit_field(visible[0]),
            len - 1
        ),
    }
}

fn humanize_audit_field(field: &str) -> String {
    field
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_audit_field_value(value: Option<&Value>) -> Option<String> {
    match value {
        None | Some(Value::Null) => None,
        Some(Value::String(text)) => Some(text.clone()),
        Some(Value::Number(number)) => Some(number.to_string()),
        Some(Value::Bool(boolean)) => Some(boolean.to_string()),
        Some(Value::Array(items)) => Some(
            items
                .iter()
                .map(|entry| normalize_audit_field_value(Some(entry)).unwrap_or_default())
                .collect::<Vec<_>>()
                .join(", "),
        ),
        Some(value @ Value::Object(_)) => {
            Some(serde_json::to_string(value).unwrap_or_else(|_| value.to_string()))
        }
    }
}

fn is_archive_event(event_kind: &str) -> bool {
    event_kind == "archived" || event_kind == "archive_until_changed"
}

fn is_private_field(field: Option<&str>) -> bool {
    field.is_some_and(|value| PRIVATE_AUDIT_FIELDS.contains(&value))
}

fn normalize_archival_note(value: Option<&Value>) -> Option<String> {
    normalize_archival_note_str(value.and_then(Value::as_str))
}

fn normalize_archival_note_str(value: Option<&str>) -> Option<String> {
    let value = value?;
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

fn as_record(value: Option<&Value>) -> Map<String, Value> {
    match value {
        Some(Value::Object(map)) => map.clone(),
        _ => Map::new(),
    }
}

fn event_kind_of(event: &Value) -> &str {
    event.get("eventKind").and_then(Value::as_str).unwrap_or("")
}

fn affected_user_id_of(event: &Value) -> Option<&str> {
    event
        .get("affectedUser")
        .and_then(|user| user.get("id"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
}

fn set_field(event: &mut Value, key: &str, value: Value) {
    if let Some(map) = event.as_object_mut() {
        map.insert(key.to_owned(), value);
    }
}

fn resolve_filter(value: Option<&str>, valid: &[&str], fallback: &str) -> String {
    match value {
        Some(value) if valid.contains(&value) => value.to_owned(),
        _ => fallback.to_owned(),
    }
}

fn trimmed_or_null(value: Option<&str>) -> Value {
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => Value::String(value.to_owned()),
        None => Value::Null,
    }
}

fn parse_query_params(request_url: Option<&str>) -> Option<ParsedParams> {
    let parsed = url::Url::parse(request_url?).ok()?;

    let mut start: Option<String> = None;
    let mut end: Option<String> = None;
    let mut event_kind: Option<String> = None;
    let mut source: Option<String> = None;
    let mut affected_user_query: Option<String> = None;
    let mut actor_query: Option<String> = None;
    let mut offset_raw: Option<String> = None;
    let mut limit_raw: Option<String> = None;

    for (key, value) in parsed.query_pairs() {
        match key.as_ref() {
            "start" => start = Some(value.into_owned()),
            "end" => end = Some(value.into_owned()),
            "eventKind" => event_kind = Some(value.into_owned()),
            "source" => source = Some(value.into_owned()),
            "affectedUserQuery" => affected_user_query = Some(value.into_owned()),
            "actorQuery" => actor_query = Some(value.into_owned()),
            "offset" => offset_raw = Some(value.into_owned()),
            "limit" => limit_raw = Some(value.into_owned()),
            _ => {}
        }
    }

    // z.string().min(1) for start/end.
    let start = start.filter(|value| !value.is_empty())?;
    let end = end.filter(|value| !value.is_empty())?;

    // offset: coerce number, int, min 0, default 0.
    let offset = match offset_raw {
        Some(raw) => parse_int(&raw).filter(|value| *value >= 0)?,
        None => 0,
    };

    // limit: coerce number, int, min 1, max 1000, default 500.
    let limit = match limit_raw {
        Some(raw) => parse_int(&raw).filter(|value| (1..=1000).contains(value))?,
        None => 500,
    };

    Some(ParsedParams {
        start,
        end,
        event_kind,
        source,
        affected_user_query,
        actor_query,
        offset,
        limit,
    })
}

fn parse_int(raw: &str) -> Option<i64> {
    // z.coerce.number().int(): Number(value) must be a finite integer.
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parsed: f64 = trimmed.parse().ok()?;
    if !parsed.is_finite() || parsed.fract() != 0.0 {
        return None;
    }
    Some(parsed as i64)
}

fn audit_logs_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(AUDIT_LOGS_PATH_PREFIX)?
        .strip_suffix(AUDIT_LOGS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

fn error_response(status: u16, error: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": error })))
}
