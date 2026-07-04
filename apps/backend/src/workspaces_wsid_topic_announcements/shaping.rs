use super::*;

// ---------------------------------------------------------------------------
// Row shaping (pure)
// ---------------------------------------------------------------------------

pub(super) fn distinct_group_ids(announcements: &[Map<String, Value>]) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();
    for row in announcements {
        if let Some(Value::String(group_id)) = row.get("group_id")
            && !group_id.is_empty()
            && !ids.iter().any(|existing| existing == group_id)
        {
            ids.push(group_id.clone());
        }
    }
    ids
}

pub(super) fn resolve_group(row: &Map<String, Value>, groups: &[(String, String)]) -> Value {
    match row.get("group_id") {
        Some(Value::String(group_id)) if !group_id.is_empty() => groups
            .iter()
            .find(|(id, _)| id == group_id)
            .map(|(id, name)| json!({ "id": id, "name": name }))
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

/// Mirrors `mapTopicAnnouncementRow`: keep every announcement column, then add
/// the serialized `attachments`, `contacts`, and `group` fields.
pub(super) fn map_announcement_row(
    mut row: Map<String, Value>,
    attachments: Vec<Value>,
    contacts: Vec<Value>,
    group: Value,
) -> Value {
    // The legacy mapper destructures these keys out of the row before spreading.
    row.remove("attachments");
    row.remove("contacts");
    row.remove("group");

    row.insert("attachments".to_owned(), Value::Array(attachments));
    row.insert("contacts".to_owned(), Value::Array(contacts));
    row.insert("group".to_owned(), group);

    Value::Object(row)
}

/// Mirrors `serializeTopicAnnouncementContact`.
pub(super) fn serialize_contact(contact: &Map<String, Value>, verification_status: &str) -> Value {
    json!({
        "archived": contact.get("archived").cloned().unwrap_or(Value::Null),
        "createdAt": contact.get("created_at").cloned().unwrap_or(Value::Null),
        "email": contact.get("email").cloned().unwrap_or(Value::Null),
        "id": contact.get("id").cloned().unwrap_or(Value::Null),
        "metadata": contact.get("metadata").cloned().unwrap_or(Value::Null),
        "name": contact.get("name").cloned().unwrap_or(Value::Null),
        "tags": contact.get("tags").cloned().unwrap_or(Value::Null),
        "verificationStatus": verification_status,
        "workspaceUserId": contact.get("workspace_user_id").cloned().unwrap_or(Value::Null),
    })
}

/// Mirrors `serializeTopicAnnouncementAttachment`.
pub(super) fn serialize_attachment(attachment: &Map<String, Value>) -> Value {
    let file_name = attachment
        .get("file_name")
        .and_then(Value::as_str)
        .unwrap_or("");
    json!({
        "contentType": attachment.get("content_type").cloned().unwrap_or(Value::Null),
        "createdAt": attachment.get("created_at").cloned().unwrap_or(Value::Null),
        "fileName": normalize_attachment_file_name(file_name),
        "id": attachment.get("id").cloned().unwrap_or(Value::Null),
        "sizeBytes": size_bytes_to_number(attachment.get("size_bytes")),
        "storagePath": attachment.get("storage_path").cloned().unwrap_or(Value::Null),
        "storageProvider": attachment.get("storage_provider").cloned().unwrap_or(Value::Null),
    })
}

/// Mirrors `Number(attachment.size_bytes)`.
pub(super) fn size_bytes_to_number(value: Option<&Value>) -> Value {
    match value {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if let Ok(parsed) = trimmed.parse::<i64>() {
                Value::Number(parsed.into())
            } else if let Ok(parsed) = trimmed.parse::<f64>() {
                Number::from_f64(parsed)
                    .map(Value::Number)
                    .unwrap_or(Value::Number(0.into()))
            } else {
                Value::Number(0.into())
            }
        }
        // `Number(null)` is 0; `Number(undefined)` is NaN, but JSON has no NaN.
        _ => Value::Number(0.into()),
    }
}

/// Mirrors `Math.max(1, Math.ceil((count ?? 0) / pageSize))`.
pub(super) fn total_pages(count: i64, page_size: i64) -> i64 {
    if page_size <= 0 {
        return 1;
    }
    let pages = ((count as f64) / (page_size as f64)).ceil() as i64;
    pages.max(1)
}

/// JS truthiness for the RPC scalar result (`if (data)`).
pub(super) fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(boolean) => *boolean,
        Value::Number(number) => number.as_f64().map(|n| n != 0.0).unwrap_or(false),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// Mirrors `normalizeTopicAnnouncementAttachmentFileName`.
pub(super) fn normalize_attachment_file_name(file_name: &str) -> String {
    let base_name = file_name.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let without_prefix = strip_generated_uuid_prefix(base_name).trim();

    if !without_prefix.is_empty() {
        without_prefix.to_owned()
    } else if !base_name.is_empty() {
        base_name.to_owned()
    } else {
        "attachment".to_owned()
    }
}

/// Strips a leading `<uuid>-` prefix (v1-5 UUID followed by `-` and >=1 char).
pub(super) fn strip_generated_uuid_prefix(base: &str) -> &str {
    let bytes = base.as_bytes();
    // Need 36 (uuid) + 1 (hyphen) + at least 1 trailing char.
    if bytes.len() < 38 || bytes[36] != b'-' {
        return base;
    }
    if !is_generated_uuid(&bytes[..36]) {
        return base;
    }
    // bytes[0..37] are all validated ASCII, so 37 is a safe char boundary.
    &base[37..]
}

pub(super) fn is_generated_uuid(bytes: &[u8]) -> bool {
    if bytes.len() != 36 {
        return false;
    }
    for (index, &byte) in bytes.iter().enumerate() {
        let valid = match index {
            8 | 13 | 18 | 23 => byte == b'-',
            // Version digit must be 1-5.
            14 => matches!(byte, b'1'..=b'5'),
            // Variant nibble must be 8, 9, a, or b (case-insensitive).
            19 => matches!(byte, b'8' | b'9' | b'a' | b'b' | b'A' | b'B'),
            _ => byte.is_ascii_hexdigit(),
        };
        if !valid {
            return false;
        }
    }
    true
}

pub(super) fn parse_content_range_count(header: Option<&str>) -> Option<i64> {
    let total = header?.rsplit('/').next()?.trim();
    if total == "*" {
        return None;
    }
    total.parse::<i64>().ok()
}

// ---------------------------------------------------------------------------
// Timestamp helpers (mirror `new Date().toISOString()`)
// ---------------------------------------------------------------------------

pub(super) fn now_iso_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    unix_millis_to_iso_timestamp(
        duration.as_secs() as i64 * 1_000 + i64::from(duration.subsec_millis()),
    )
}

pub(super) fn unix_millis_to_iso_timestamp(unix_millis: i64) -> String {
    let seconds = unix_millis.div_euclid(1_000);
    let millis = unix_millis.rem_euclid(1_000);
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

pub(super) fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };

    (year + if month <= 2 { 1 } else { 0 }, month, day)
}
