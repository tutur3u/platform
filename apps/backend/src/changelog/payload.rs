use super::*;

pub(super) fn create_changelog_payload_from_body(
    body_text: Option<&str>,
    user_id: &str,
) -> Result<Value, Box<BackendResponse>> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(Box::new(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )])));
    };
    let Some(object) = value.as_object() else {
        return Err(Box::new(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )])));
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
        return Err(Box::new(invalid_request_data_response(issues)));
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

pub(super) fn update_changelog_payload_from_body(
    body_text: Option<&str>,
) -> Result<Value, Box<BackendResponse>> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(Box::new(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )])));
    };
    let Some(object) = value.as_object() else {
        return Err(Box::new(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )])));
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
        return Err(Box::new(invalid_request_data_response(issues)));
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

pub(super) fn publish_changelog_input_from_body(
    body_text: Option<&str>,
) -> Result<bool, Box<BackendResponse>> {
    let Ok(value) = serde_json::from_str::<Value>(body_text.unwrap_or_default()) else {
        return Err(Box::new(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )])));
    };
    let Some(object) = value.as_object() else {
        return Err(Box::new(invalid_request_data_response(vec![issue(
            "body",
            "Expected a JSON object",
        )])));
    };

    match object.get("is_published") {
        Some(Value::Bool(is_published)) => Ok(*is_published),
        Some(_) => Err(Box::new(invalid_request_data_response(vec![issue(
            "is_published",
            "Expected boolean",
        )]))),
        None => Err(Box::new(invalid_request_data_response(vec![issue(
            "is_published",
            "Expected boolean",
        )]))),
    }
}

pub(super) fn publish_changelog_payload(is_published: bool, existing_entry: &Value) -> Value {
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

pub(super) fn required_changelog_string(
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

pub(super) fn optional_changelog_string(
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

pub(super) fn required_changelog_content(
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

pub(super) fn optional_changelog_content(
    object: &Map<String, Value>,
    field: &'static str,
    issues: &mut Vec<Value>,
) -> Option<Value> {
    object
        .get(field)
        .and_then(|value| changelog_content_from_value(value, field, issues))
}

pub(super) fn changelog_content_from_value(
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

pub(super) fn required_changelog_category(
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

pub(super) fn optional_changelog_category(
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

pub(super) fn optional_changelog_url(
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

pub(super) fn valid_changelog_category(category: &str) -> bool {
    matches!(
        category,
        "feature" | "improvement" | "bugfix" | "breaking" | "security" | "performance"
    )
}

pub(super) fn normalize_changelog_slug(slug: &str) -> String {
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

pub(super) fn issue(path: &'static str, message: &'static str) -> Value {
    json!({
        "path": path.split('.').collect::<Vec<_>>(),
        "message": message,
    })
}

pub(super) fn invalid_request_data_response(errors: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({
            "message": CHANGELOG_INVALID_REQUEST_MESSAGE,
            "errors": errors,
        }),
    ))
}
