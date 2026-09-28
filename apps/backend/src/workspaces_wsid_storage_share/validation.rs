use super::*;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/// Extract the `:wsId` segment for `/api/v1/workspaces/:wsId/storage/share`.
pub(super) fn storage_share_path_param(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    if segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "storage"
        && segments[5] == "share"
    {
        segments.get(3).copied()
    } else {
        None
    }
}

pub(super) fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect()
}

/// Parse and validate the GET query parameters.
pub(super) fn parse_share_query(url: Option<&url::Url>) -> Result<ShareQuery, &'static str> {
    let get = |key: &str| -> Option<String> {
        url?.query_pairs()
            .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
            .filter(|v| !v.is_empty())
    };

    // `path` is required.
    let path = get("path").ok_or("Invalid query params")?;
    if path.len() > MAX_PATH_LENGTH {
        return Err("Invalid query params");
    }

    // Optional `expiresIn` — coerce to u64 and clamp.
    let expires_in = if let Some(raw) = get("expiresIn") {
        let n: u64 = raw.parse().map_err(|_| "Invalid query params")?;
        if !(MIN_EXPIRES_IN..=MAX_EXPIRES_IN).contains(&n) {
            return Err("Invalid query params");
        }
        Some(n)
    } else {
        None
    };

    // Optional image transform fields.
    let width = if let Some(raw) = get("width") {
        let n: u64 = raw.parse().map_err(|_| "Invalid query params")?;
        if !(MIN_DIMENSION..=MAX_DIMENSION).contains(&n) {
            return Err("Invalid query params");
        }
        Some(n)
    } else {
        None
    };

    let height = if let Some(raw) = get("height") {
        let n: u64 = raw.parse().map_err(|_| "Invalid query params")?;
        if !(MIN_DIMENSION..=MAX_DIMENSION).contains(&n) {
            return Err("Invalid query params");
        }
        Some(n)
    } else {
        None
    };

    let resize = if let Some(raw) = get("resize") {
        match raw.as_str() {
            "cover" | "contain" | "fill" => Some(raw),
            _ => return Err("Invalid query params"),
        }
    } else {
        None
    };

    let quality = if let Some(raw) = get("quality") {
        let n: u64 = raw.parse().map_err(|_| "Invalid query params")?;
        if !(MIN_QUALITY..=MAX_QUALITY).contains(&n) {
            return Err("Invalid query params");
        }
        Some(n)
    } else {
        None
    };

    let format = if let Some(raw) = get("format") {
        if raw != "origin" {
            return Err("Invalid query params");
        }
        Some(raw)
    } else {
        None
    };

    // Mirror the legacy `superRefine`: if any transform is present, width or
    // height must also be present.
    let has_transform = width.is_some()
        || height.is_some()
        || resize.is_some()
        || quality.is_some()
        || format.is_some();

    if has_transform && width.is_none() && height.is_none() {
        return Err("Invalid query params");
    }

    Ok(ShareQuery {
        path,
        expires_in,
        width,
        height,
        resize,
        quality,
        format,
    })
}

pub(super) fn sanitize_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some(String::new());
    }

    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim().trim_matches('/');

    let segments: Vec<&str> = trimmed.split('/').filter(|s| !s.is_empty()).collect();

    for segment in &segments {
        if *segment == ".." || *segment == "." || segment.is_empty() {
            return None;
        }
        if segment.contains("..") {
            return None;
        }
    }

    Some(segments.join("/"))
}

pub(super) fn is_reserved_mobile_deployment_drive_path(ws_id: &str, sanitized_path: &str) -> bool {
    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID {
        return false;
    }

    let Some(normalized) = sanitize_path(sanitized_path) else {
        return false;
    };

    normalized == MOBILE_DEPLOYMENT_DRIVE_PREFIX
        || normalized.starts_with(&format!("{MOBILE_DEPLOYMENT_DRIVE_PREFIX}/"))
        || (!normalized.is_empty()
            && MOBILE_DEPLOYMENT_DRIVE_PREFIX.starts_with(&format!("{normalized}/")))
}

pub(super) fn finance_transaction_id_from_storage_path(path: &str) -> Option<&str> {
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    if segments.first() == Some(&"finance")
        && segments.get(1) == Some(&"transactions")
        && segments.get(2).is_some_and(|id| !id.is_empty())
    {
        segments.get(2).copied()
    } else {
        None
    }
}

pub(super) fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}

pub(super) fn is_uuid_literal(value: &str) -> bool {
    let value = value.trim();
    value.len() == 36
        && value.chars().enumerate().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

pub(super) fn is_workspace_handle(value: &str) -> bool {
    let len = value.len();
    if len == 0 || len > 64 {
        return false;
    }
    value.chars().enumerate().all(|(i, c)| {
        let is_edge = i == 0 || i + 1 == len;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!is_edge && matches!(c, '_' | '-'))
    })
}

pub(super) fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

pub(super) fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
