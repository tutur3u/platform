use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const CHANGELOG_LIST_PATH: &str = "/api/v1/infrastructure/changelog";
const CHANGELOG_SLUG_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/slug/";
const CHANGELOG_DETAIL_PATH_PREFIX: &str = "/api/v1/infrastructure/changelog/";
const CHANGELOG_ENTRIES_TABLE: &str = "changelog_entries";
const CHANGELOG_DUPLICATE_SLUG_MESSAGE: &str = "A changelog entry with this slug already exists";
const CHANGELOG_CREATE_ERROR_MESSAGE: &str = "Error creating changelog entry";
const CHANGELOG_UPDATE_ERROR_MESSAGE: &str = "Error updating changelog entry";
const CHANGELOG_DELETE_ERROR_MESSAGE: &str = "Error deleting changelog entry";
const CHANGELOG_PUBLISH_ERROR_MESSAGE: &str = "Error updating changelog publish status";
const CHANGELOG_DELETE_SUCCESS_MESSAGE: &str = "Changelog entry deleted successfully";
const CHANGELOG_INVALID_REQUEST_MESSAGE: &str = "Invalid request data";
const CHANGELOG_LIST_ERROR_MESSAGE: &str = "Error fetching changelog entries";
const CHANGELOG_ENTRY_NOT_FOUND_MESSAGE: &str = "Changelog entry not found";
const HAS_WORKSPACE_PERMISSION_RPC: &str = "has_workspace_permission";
const MANAGE_CHANGELOG_PERMISSION: &str = "manage_changelog";
const MAX_COLOR_LENGTH: usize = 50;
const MAX_NAME_LENGTH: usize = 255;
const MAX_SEARCH_LENGTH: usize = 500;
const POSTGREST_SINGLE_JSON: &str = "application/vnd.pgrst.object+json";
const POSTGREST_DUPLICATE_KEY_CODE: &str = "23505";
const POSTGREST_SINGULAR_RESPONSE_ERROR_CODE: &str = "PGRST116";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";

#[derive(Deserialize)]
struct PostgrestError {
    code: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct ChangelogListQuery {
    category: Option<String>,
    page: Option<i64>,
    page_size: Option<i64>,
    published: Option<bool>,
}

struct ChangelogWriteAccess {
    access_token: String,
    user_id: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ChangelogAuthError {
    Forbidden,
    Internal,
    Unauthorized,
}

#[derive(Serialize)]
struct HasWorkspacePermissionRequest<'a> {
    p_permission: &'a str,
    p_user_id: &'a str,
    p_ws_id: &'a str,
}

enum ChangelogRoute<'a> {
    Detail { id: &'a str },
    List,
    Publish { id: &'a str },
    Slug { slug: &'a str },
}

pub(crate) async fn handle_changelog_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let route = changelog_route(request.path)?;

    Some(match (request.method, route) {
        ("GET", ChangelogRoute::Detail { id }) => {
            changelog_detail_response(&config.contact_data, request, id, outbound).await
        }
        ("GET", ChangelogRoute::List) => {
            changelog_list_response(&config.contact_data, request, outbound).await
        }
        ("GET", ChangelogRoute::Slug { slug }) => {
            changelog_slug_response(&config.contact_data, slug, outbound).await
        }
        ("POST", ChangelogRoute::List) => {
            changelog_create_response(&config.contact_data, request, outbound).await
        }
        ("PUT", ChangelogRoute::Detail { id }) => {
            changelog_update_response(&config.contact_data, request, id, outbound).await
        }
        ("DELETE", ChangelogRoute::Detail { id }) => {
            changelog_delete_response(&config.contact_data, request, id, outbound).await
        }
        ("POST", ChangelogRoute::Publish { id }) => {
            changelog_publish_response(&config.contact_data, request, id, outbound).await
        }
        (method, ChangelogRoute::Detail { .. }) => method_not_allowed(method, "GET, PUT, DELETE"),
        (method, ChangelogRoute::List) => method_not_allowed(method, "GET, POST"),
        (method, ChangelogRoute::Publish { .. }) => method_not_allowed(method, "POST"),
        (method, ChangelogRoute::Slug { .. }) => method_not_allowed(method, "GET"),
    })
}

pub(crate) fn should_buffer_request_body(method: &str, path: &str) -> bool {
    matches!(
        (method, changelog_route(path)),
        ("POST", Some(ChangelogRoute::List))
            | ("PUT", Some(ChangelogRoute::Detail { .. }))
            | ("POST", Some(ChangelogRoute::Publish { .. }))
    )
}

async fn changelog_create_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };
    let payload = match create_changelog_payload_from_body(request.body_text, &access.user_id) {
        Ok(payload) => payload,
        Err(response) => return response,
    };
    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &[("select", "*".to_owned())])
    else {
        return changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE);
    };
    let Ok(body) = serde_json::to_string(&payload) else {
        return changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Post,
        &url,
        POSTGREST_SINGLE_JSON,
        &access.access_token,
        Some("return=representation"),
        Some(&body),
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return if is_postgrest_error_code(&response, POSTGREST_DUPLICATE_KEY_CODE) {
            changelog_message_response(409, CHANGELOG_DUPLICATE_SLUG_MESSAGE)
        } else {
            changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE)
        };
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(201, body)),
        Err(_) => changelog_message_response(500, CHANGELOG_CREATE_ERROR_MESSAGE),
    }
}

async fn changelog_update_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };
    let payload = match update_changelog_payload_from_body(request.body_text) {
        Ok(payload) => payload,
        Err(response) => return response,
    };

    match changelog_existing_entry(contact_data, &access.access_token, id, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return changelog_error_response(404),
        Err(()) => return changelog_error_response(404),
    }

    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{id}"))],
    ) else {
        return changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE);
    };
    let Ok(body) = serde_json::to_string(&payload) else {
        return changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        POSTGREST_SINGLE_JSON,
        &access.access_token,
        Some("return=representation"),
        Some(&body),
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return if is_postgrest_error_code(&response, POSTGREST_DUPLICATE_KEY_CODE) {
            changelog_message_response(409, CHANGELOG_DUPLICATE_SLUG_MESSAGE)
        } else {
            changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE)
        };
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_message_response(500, CHANGELOG_UPDATE_ERROR_MESSAGE),
    }
}

async fn changelog_delete_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };

    match changelog_existing_entry(contact_data, &access.access_token, id, outbound).await {
        Ok(Some(_)) => {}
        Ok(None) => return changelog_error_response(404),
        Err(()) => return changelog_error_response(404),
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &[("id", format!("eq.{id}"))])
    else {
        return changelog_message_response(500, CHANGELOG_DELETE_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Delete,
        &url,
        APPLICATION_JSON,
        &access.access_token,
        None,
        None,
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_DELETE_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return changelog_message_response(500, CHANGELOG_DELETE_ERROR_MESSAGE);
    }

    no_store_response(json_response(
        200,
        json!({
            "message": CHANGELOG_DELETE_SUCCESS_MESSAGE,
        }),
    ))
}

async fn changelog_publish_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let access = match request_changelog_write_access(contact_data, request, outbound).await {
        Ok(access) => access,
        Err(error) => return changelog_auth_error_response(error),
    };
    let is_published = match publish_changelog_input_from_body(request.body_text) {
        Ok(is_published) => is_published,
        Err(response) => return response,
    };
    let existing_entry =
        match changelog_existing_entry(contact_data, &access.access_token, id, outbound).await {
            Ok(Some(entry)) => entry,
            Ok(None) => return changelog_error_response(404),
            Err(()) => return changelog_error_response(404),
        };
    let payload = publish_changelog_payload(is_published, &existing_entry);
    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{id}"))],
    ) else {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    };
    let Ok(body) = serde_json::to_string(&payload) else {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    };
    let Ok(response) = send_changelog_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Patch,
        &url,
        POSTGREST_SINGLE_JSON,
        &access.access_token,
        Some("return=representation"),
        Some(&body),
    )
    .await
    else {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    };

    if !(200..300).contains(&response.status) {
        return changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE);
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_message_response(500, CHANGELOG_PUBLISH_ERROR_MESSAGE),
    }
}

async fn changelog_existing_entry(
    contact_data: &contact::ContactDataConfig,
    access_token: &str,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Option<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[("select", "*".to_owned()), ("id", format!("eq.{id}"))],
    ) else {
        return Err(());
    };
    let response = send_changelog_authenticated_request(
        contact_data,
        outbound,
        OutboundMethod::Get,
        &url,
        POSTGREST_SINGLE_JSON,
        access_token,
        None,
        None,
    )
    .await?;

    if !(200..300).contains(&response.status) {
        return if is_postgrest_single_not_found(&response) {
            Ok(None)
        } else {
            Err(())
        };
    }

    response.json::<Value>().map(Some).map_err(|_| ())
}

async fn request_changelog_write_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Result<ChangelogWriteAccess, ChangelogAuthError> {
    if !contact_data.configured() {
        return Err(ChangelogAuthError::Internal);
    }

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return Err(ChangelogAuthError::Unauthorized);
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return Err(ChangelogAuthError::Unauthorized);
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return Err(ChangelogAuthError::Unauthorized);
    };

    match has_manage_changelog_permission(contact_data, &user_id, outbound).await {
        Ok(true) => Ok(ChangelogWriteAccess {
            access_token,
            user_id,
        }),
        Ok(false) => Err(ChangelogAuthError::Forbidden),
        Err(()) => Err(ChangelogAuthError::Internal),
    }
}

fn create_changelog_payload_from_body(
    body_text: Option<&str>,
    user_id: &str,
) -> Result<Value, BackendResponse> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )]));
    };
    let Some(object) = value.as_object() else {
        return Err(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )]));
    };
    let mut issues = Vec::new();
    let title = required_changelog_string(object, "title", MAX_NAME_LENGTH, &mut issues);
    let slug = required_changelog_string(object, "slug", MAX_NAME_LENGTH, &mut issues);
    let content = required_changelog_content(object, "content", &mut issues);
    let category = required_changelog_category(object, &mut issues);
    let summary =
        optional_changelog_string(object, "summary", MAX_SEARCH_LENGTH, false, &mut issues);
    let version =
        optional_changelog_string(object, "version", MAX_COLOR_LENGTH, false, &mut issues);
    let cover_image_url = optional_changelog_url(object, "cover_image_url", &mut issues);

    if !issues.is_empty() {
        return Err(invalid_request_data_response(issues));
    }

    let mut payload = Map::new();
    payload.insert("title".to_owned(), json!(title.expect("validated title")));
    payload.insert(
        "slug".to_owned(),
        json!(normalize_changelog_slug(&slug.expect("validated slug"))),
    );
    payload.insert("content".to_owned(), content.expect("validated content"));
    payload.insert(
        "category".to_owned(),
        json!(category.expect("validated category")),
    );
    payload.insert("creator_id".to_owned(), json!(user_id));

    if let Some(summary) = summary {
        payload.insert("summary".to_owned(), summary);
    }
    if let Some(version) = version {
        payload.insert("version".to_owned(), version);
    }
    if let Some(cover_image_url) = cover_image_url {
        payload.insert("cover_image_url".to_owned(), cover_image_url);
    }

    Ok(Value::Object(payload))
}

fn update_changelog_payload_from_body(body_text: Option<&str>) -> Result<Value, BackendResponse> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )]));
    };
    let Some(object) = value.as_object() else {
        return Err(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )]));
    };
    let mut issues = Vec::new();
    let title = optional_changelog_string(object, "title", MAX_NAME_LENGTH, false, &mut issues);
    let slug = optional_changelog_string(object, "slug", MAX_NAME_LENGTH, false, &mut issues);
    let content = optional_changelog_content(object, "content", &mut issues);
    let summary =
        optional_changelog_string(object, "summary", MAX_SEARCH_LENGTH, true, &mut issues);
    let category = optional_changelog_category(object, &mut issues);
    let version = optional_changelog_string(object, "version", MAX_COLOR_LENGTH, true, &mut issues);
    let cover_image_url = optional_changelog_url(object, "cover_image_url", &mut issues);

    if !issues.is_empty() {
        return Err(invalid_request_data_response(issues));
    }

    let mut payload = Map::new();
    if let Some(title) = title {
        payload.insert("title".to_owned(), title);
    }
    if let Some(slug) = slug {
        let Some(slug) = slug.as_str() else {
            payload.insert("slug".to_owned(), slug);
            return Ok(Value::Object(payload));
        };
        payload.insert("slug".to_owned(), json!(normalize_changelog_slug(slug)));
    }
    if let Some(content) = content {
        payload.insert("content".to_owned(), content);
    }
    if let Some(summary) = summary {
        payload.insert("summary".to_owned(), summary);
    }
    if let Some(category) = category {
        payload.insert("category".to_owned(), category);
    }
    if let Some(version) = version {
        payload.insert("version".to_owned(), version);
    }
    if let Some(cover_image_url) = cover_image_url {
        payload.insert("cover_image_url".to_owned(), cover_image_url);
    }

    Ok(Value::Object(payload))
}

fn publish_changelog_input_from_body(body_text: Option<&str>) -> Result<bool, BackendResponse> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )]));
    };
    let Some(object) = value.as_object() else {
        return Err(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )]));
    };

    match object.get("is_published") {
        Some(Value::Bool(is_published)) => Ok(*is_published),
        Some(_) => Err(invalid_request_data_response(vec![issue(
            "is_published",
            "Expected boolean",
        )])),
        None => Err(invalid_request_data_response(vec![issue(
            "is_published",
            "Expected boolean",
        )])),
    }
}

fn publish_changelog_payload(is_published: bool, existing_entry: &Value) -> Value {
    let published_at = if !is_published {
        Value::Null
    } else if let Some(existing_published_at) = existing_entry
        .get("published_at")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    {
        json!(existing_published_at)
    } else {
        json!(current_utc_timestamp_iso_millis())
    };

    json!({
        "is_published": is_published,
        "published_at": published_at,
    })
}

fn required_changelog_string(
    object: &Map<String, Value>,
    field: &'static str,
    max_length: usize,
    issues: &mut Vec<Value>,
) -> Option<String> {
    match object.get(field) {
        Some(Value::String(value)) if value.is_empty() => {
            issues.push(issue(field, "Expected at least 1 character"));
            None
        }
        Some(Value::String(value)) if value.chars().count() > max_length => {
            issues.push(issue(field, "Expected a shorter string"));
            None
        }
        Some(Value::String(value)) => Some(value.to_owned()),
        Some(_) => {
            issues.push(issue(field, "Expected string"));
            None
        }
        None => {
            issues.push(issue(field, "Expected string"));
            None
        }
    }
}

fn optional_changelog_string(
    object: &Map<String, Value>,
    field: &'static str,
    max_length: usize,
    nullable: bool,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    match object.get(field) {
        Some(Value::String(value)) if value.is_empty() && matches!(field, "title" | "slug") => {
            issues.push(issue(field, "Expected at least 1 character"));
            None
        }
        Some(Value::String(value)) if value.chars().count() > max_length => {
            issues.push(issue(field, "Expected a shorter string"));
            None
        }
        Some(Value::String(value)) => Some(json!(value)),
        Some(Value::Null) if nullable => Some(Value::Null),
        Some(_) => {
            issues.push(issue(field, "Expected string"));
            None
        }
        None => None,
    }
}

fn required_changelog_content(
    object: &Map<String, Value>,
    field: &'static str,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    match object.get(field) {
        Some(value) => changelog_content_from_value(value, field, issues),
        None => {
            issues.push(issue(field, "Expected editor document"));
            None
        }
    }
}

fn optional_changelog_content(
    object: &Map<String, Value>,
    field: &'static str,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    object
        .get(field)
        .and_then(|value| changelog_content_from_value(value, field, issues))
}

fn changelog_content_from_value(
    value: &Value,
    field: &'static str,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    let Some(object) = value.as_object() else {
        issues.push(issue(field, "Expected editor document"));
        return None;
    };

    if object.get("type").and_then(Value::as_str) != Some("doc") {
        issues.push(issue(field, "Expected editor document"));
        return None;
    }

    let mut content = Map::new();
    content.insert("type".to_owned(), json!("doc"));

    if let Some(raw_content) = object.get("content") {
        if raw_content.is_array() {
            content.insert("content".to_owned(), raw_content.clone());
        } else {
            issues.push(issue("content.content", "Expected array"));
            return None;
        }
    }

    Some(Value::Object(content))
}

fn required_changelog_category(
    object: &Map<String, Value>,
    issues: &mut Vec<Value>,
) -> Option<String> {
    match object.get("category").and_then(Value::as_str) {
        Some(category) if valid_changelog_category(category) => Some(category.to_owned()),
        Some(_) => {
            issues.push(issue("category", "Expected valid category"));
            None
        }
        None => {
            issues.push(issue("category", "Expected valid category"));
            None
        }
    }
}

fn optional_changelog_category(
    object: &Map<String, Value>,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    match object.get("category") {
        Some(Value::String(category)) if valid_changelog_category(category) => {
            Some(json!(category))
        }
        Some(_) => {
            issues.push(issue("category", "Expected valid category"));
            None
        }
        None => None,
    }
}

fn optional_changelog_url(
    object: &Map<String, Value>,
    field: &'static str,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    match object.get(field) {
        Some(Value::String(value)) if url::Url::parse(value).is_ok() => Some(json!(value)),
        Some(Value::String(_)) => {
            issues.push(issue(field, "Expected URL"));
            None
        }
        Some(Value::Null) => Some(Value::Null),
        Some(_) => {
            issues.push(issue(field, "Expected URL"));
            None
        }
        None => None,
    }
}

fn valid_changelog_category(category: &str) -> bool {
    matches!(
        category,
        "feature" | "improvement" | "bugfix" | "breaking" | "security" | "performance"
    )
}

fn normalize_changelog_slug(slug: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_whitespace = false;

    for character in slug.to_lowercase().chars() {
        if character.is_whitespace() {
            if !previous_was_whitespace {
                normalized.push('-');
            }
            previous_was_whitespace = true;
            continue;
        }

        previous_was_whitespace = false;
        if character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-' {
            normalized.push(character);
        }
    }

    normalized
}

fn issue(path: &'static str, message: &'static str) -> Value {
    json!({
        "path": path.split('.').collect::<Vec<_>>(),
        "message": message,
    })
}

fn invalid_request_data_response(errors: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": CHANGELOG_INVALID_REQUEST_MESSAGE,
            "errors": errors,
        }),
    ))
}

fn current_utc_timestamp_iso_millis() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = i64::try_from(duration.as_secs()).unwrap_or(i64::MAX);
    let milliseconds = duration.subsec_millis();
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_unix_epoch_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{milliseconds:03}Z")
}

fn civil_from_unix_epoch_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };

    (year, month, day)
}

async fn send_changelog_authenticated_request(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    method: OutboundMethod,
    url: &str,
    accept: &str,
    access_token: &str,
    prefer: Option<&str>,
    body: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {access_token}");
    let mut request = OutboundRequest::new(method, url)
        .with_header("Accept", accept)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    if let Some(body) = body {
        request = request
            .with_header("Content-Type", APPLICATION_JSON)
            .with_body(body);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn changelog_auth_error_response(error: ChangelogAuthError) -> BackendResponse {
    match error {
        ChangelogAuthError::Unauthorized => changelog_message_response(401, "Unauthorized"),
        ChangelogAuthError::Forbidden => changelog_message_response(403, "Forbidden"),
        ChangelogAuthError::Internal => no_store_response(json_response(
            500,
            json!({
                "error": WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE,
            }),
        )),
    }
}

async fn changelog_list_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_list_error_response();
    }

    let query = changelog_list_query_from_url(request.url);
    let authorized = request_has_changelog_admin_access(contact_data, request, outbound).await;
    let mut params = vec![
        ("select", "*".to_owned()),
        (
            "order",
            "published_at.desc.nullslast,created_at.desc".to_owned(),
        ),
    ];

    if !authorized {
        params.extend(public_changelog_filters());
    } else if let Some(published) = query.published {
        params.push(("is_published", format!("eq.{published}")));
    }

    if let Some(category) = &query.category {
        params.push(("category", format!("eq.{category}")));
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &params) else {
        return changelog_list_error_response();
    };
    let range = changelog_range(&query);
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        APPLICATION_JSON,
        Some(&range),
        Some("count=exact"),
    )
    .await
    else {
        return changelog_list_error_response();
    };

    if !(200..300).contains(&response.status) {
        return changelog_list_error_response();
    }

    let Ok(data) = response.json::<Value>() else {
        return changelog_list_error_response();
    };
    let total = total_count_from_content_range(&response).unwrap_or(0);
    let total_pages = changelog_total_pages(total, query.page_size);

    no_store_response(json_response(
        200,
        json!({
            "data": data,
            "pagination": {
                "page": query.page,
                "pageSize": query.page_size,
                "total": total,
                "totalPages": total_pages,
            },
        }),
    ))
}

async fn changelog_detail_response(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let authorized = request_has_changelog_admin_access(contact_data, request, outbound).await;
    let mut params = vec![("select", "*".to_owned()), ("id", format!("eq.{id}"))];

    if !authorized {
        params.extend(public_changelog_filters());
    }

    let Some(url) = contact_data.rest_url(CHANGELOG_ENTRIES_TABLE, &params) else {
        return changelog_error_response(500);
    };
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        POSTGREST_SINGLE_JSON,
        None,
        None,
    )
    .await
    else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}

async fn changelog_slug_response(
    contact_data: &contact::ContactDataConfig,
    slug: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    if !contact_data.configured() {
        return changelog_error_response(500);
    }

    let Some(url) = contact_data.rest_url(
        CHANGELOG_ENTRIES_TABLE,
        &[
            ("select", "*".to_owned()),
            ("slug", format!("eq.{slug}")),
            ("is_published", "eq.true".to_owned()),
            ("published_at", "not.is.null".to_owned()),
        ],
    ) else {
        return changelog_error_response(500);
    };
    let Ok(response) = send_changelog_get(
        contact_data,
        outbound,
        &url,
        POSTGREST_SINGLE_JSON,
        None,
        None,
    )
    .await
    else {
        return changelog_error_response(500);
    };

    if !(200..300).contains(&response.status) {
        return changelog_error_response(if is_postgrest_single_not_found(&response) {
            404
        } else {
            500
        });
    }

    match response.json::<Value>() {
        Ok(body) => no_store_response(json_response(200, body)),
        Err(_) => changelog_error_response(500),
    }
}

async fn request_has_changelog_admin_access(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> bool {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return false;
    };
    let Some(user) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound).await
    else {
        return false;
    };
    let Some(user_id) = user.id.filter(|id| !id.trim().is_empty()) else {
        return false;
    };

    has_manage_changelog_permission(contact_data, &user_id, outbound)
        .await
        .unwrap_or(false)
}

async fn has_manage_changelog_permission(
    contact_data: &contact::ContactDataConfig,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<bool, ()> {
    let Some(rpc_url) = contact_data.rpc_url(HAS_WORKSPACE_PERMISSION_RPC) else {
        return Err(());
    };
    let Some(service_role_key) = contact_data.service_role_key() else {
        return Err(());
    };
    let Ok(body) = serde_json::to_string(&HasWorkspacePermissionRequest {
        p_permission: MANAGE_CHANGELOG_PERMISSION,
        p_user_id: user_id,
        p_ws_id: ROOT_WORKSPACE_ID,
    }) else {
        return Err(());
    };
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

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<bool>().map_err(|_| ())
}

async fn send_changelog_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    accept: &str,
    range: Option<&str>,
    prefer: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let mut request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", accept)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if let Some(range) = range {
        request = request
            .with_header("Range-Unit", "items")
            .with_header("Range", range);
    }

    if let Some(prefer) = prefer {
        request = request.with_header("Prefer", prefer);
    }

    outbound.send(request).await.map_err(|_| ())
}

fn changelog_route(path: &str) -> Option<ChangelogRoute<'_>> {
    if path == CHANGELOG_LIST_PATH {
        return Some(ChangelogRoute::List);
    }

    if let Some(slug) = path.strip_prefix(CHANGELOG_SLUG_PATH_PREFIX)
        && !slug.is_empty()
        && !slug.contains('/')
    {
        return Some(ChangelogRoute::Slug { slug });
    }

    let id = path.strip_prefix(CHANGELOG_DETAIL_PATH_PREFIX)?;

    if let Some(id) = id.strip_suffix("/publish")
        && valid_changelog_id_segment(id)
    {
        return Some(ChangelogRoute::Publish { id });
    }

    if !valid_changelog_id_segment(id) {
        return None;
    }

    Some(ChangelogRoute::Detail { id })
}

fn valid_changelog_id_segment(id: &str) -> bool {
    !id.is_empty() && !id.contains('/') && id != "slug" && id != "upload"
}

fn changelog_list_query_from_url(request_url: Option<&str>) -> ChangelogListQuery {
    let mut query = ChangelogListQuery {
        category: None,
        page: Some(1),
        page_size: Some(20),
        published: None,
    };
    let Some(url) = request_url.and_then(|request_url| url::Url::parse(request_url).ok()) else {
        return query;
    };

    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "category" if query.category.is_none() && !value.is_empty() => {
                query.category = Some(value.into_owned());
            }
            "page" => query.page = parse_js_parse_int_prefix(&value),
            "pageSize" => query.page_size = parse_js_parse_int_prefix(&value),
            "published" if value == "true" => query.published = Some(true),
            "published" if value == "false" => query.published = Some(false),
            _ => {}
        }
    }

    query
}

fn changelog_range(query: &ChangelogListQuery) -> String {
    let (Some(page), Some(page_size)) = (query.page, query.page_size) else {
        return "NaN-NaN".to_owned();
    };
    let page = i128::from(page);
    let page_size = i128::from(page_size);
    let start = (page - 1) * page_size;
    let end = start + page_size - 1;

    format!("{start}-{end}")
}

fn changelog_total_pages(total: usize, page_size: Option<i64>) -> Option<i64> {
    let page_size = page_size?;

    if page_size == 0 {
        return None;
    }

    let total = i128::try_from(total).ok()?;
    let page_size = i128::from(page_size);
    let total_pages = if page_size > 0 {
        (total + page_size - 1) / page_size
    } else {
        total / page_size
    };

    i64::try_from(total_pages).ok()
}

fn parse_js_parse_int_prefix(value: &str) -> Option<i64> {
    let trimmed = value.trim_start();
    let mut chars = trimmed.char_indices().peekable();
    let mut sign = 1_i64;

    if let Some((_, first)) = chars.peek().copied() {
        match first {
            '-' => {
                sign = -1;
                chars.next();
            }
            '+' => {
                chars.next();
            }
            _ => {}
        }
    }

    let mut digits = String::new();
    while let Some((_, character)) = chars.peek().copied() {
        if !character.is_ascii_digit() {
            break;
        }
        digits.push(character);
        chars.next();
    }

    if digits.is_empty() {
        return None;
    }

    digits.parse::<i64>().ok().map(|value| sign * value)
}

fn public_changelog_filters() -> Vec<(&'static str, String)> {
    vec![
        ("is_published", "eq.true".to_owned()),
        ("published_at", "not.is.null".to_owned()),
    ]
}

fn total_count_from_content_range(response: &OutboundResponse) -> Option<usize> {
    let header = response.header("content-range")?;
    let (_, total) = header.rsplit_once('/')?;

    total.parse::<usize>().ok()
}

fn is_postgrest_single_not_found(response: &crate::outbound::OutboundResponse) -> bool {
    is_postgrest_error_code(response, POSTGREST_SINGULAR_RESPONSE_ERROR_CODE)
}

fn is_postgrest_error_code(response: &crate::outbound::OutboundResponse, code: &str) -> bool {
    response
        .json::<PostgrestError>()
        .ok()
        .and_then(|error| error.code)
        .as_deref()
        == Some(code)
}

fn changelog_list_error_response() -> BackendResponse {
    no_store_response(json_response(
        500,
        json!({
            "message": CHANGELOG_LIST_ERROR_MESSAGE,
        }),
    ))
}

fn changelog_error_response(status: u16) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": CHANGELOG_ENTRY_NOT_FOUND_MESSAGE,
        }),
    ))
}

fn changelog_message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({
            "message": message,
        }),
    ))
}
