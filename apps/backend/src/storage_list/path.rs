use super::*;

// ---------------------------------------------------------------------------
// Reserved mobile-deployment drive filtering (mobile-deployment/storage-policy.ts).
// ---------------------------------------------------------------------------

/// Mirror of `isReservedMobileDeploymentDrivePath`.
pub(super) fn is_reserved_mobile_deployment_drive_path(ws_id: &str, path: &str) -> bool {
    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID {
        return false;
    }

    let Some(normalized) = sanitize_path(path) else {
        return false;
    };

    normalized == MOBILE_DEPLOYMENT_DRIVE_PREFIX
        || normalized.starts_with(&format!("{MOBILE_DEPLOYMENT_DRIVE_PREFIX}/"))
        || (!normalized.is_empty()
            && MOBILE_DEPLOYMENT_DRIVE_PREFIX.starts_with(&format!("{normalized}/")))
}

/// Mirror of `filterReservedMobileDeploymentDriveEntries`: only at the root of a
/// ROOT workspace (empty path), drop the reserved `.tuturuuu` entry. When the
/// path is non-empty (normalizeRelativePath truthy) the entries pass unchanged.
pub(super) fn filter_reserved_mobile_deployment_drive_entries(
    ws_id: &str,
    path: &str,
    entries: Vec<StorageListEntry>,
) -> Vec<StorageListEntry> {
    // normalizeRelativePath(path) === sanitizePath(path) for the already-sanitized
    // value passed in by the caller; a None result leaves entries unchanged.
    let Some(normalized) = sanitize_path(path) else {
        return entries;
    };

    if resolve_workspace_id(ws_id) != ROOT_WORKSPACE_ID || !normalized.is_empty() {
        return entries;
    }

    entries
        .into_iter()
        .filter(|entry| entry.name() != Some(RESERVED_FOLDER_ENTRY_NAME))
        .collect()
}

// ---------------------------------------------------------------------------
// sanitizePath (storage-path.ts).
// ---------------------------------------------------------------------------

/// Mirror of `sanitizePath`. Returns `None` for invalid paths, otherwise the
/// normalized path (possibly empty).
pub(super) fn sanitize_path(path: &str) -> Option<String> {
    if path.is_empty() {
        return Some(String::new());
    }

    let normalized = path.replace('\\', "/");
    let trimmed = normalized.trim().trim_matches('/');

    let segments: Vec<&str> = trimmed
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();

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

fn resolve_workspace_id(identifier: &str) -> String {
    if identifier.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        ROOT_WORKSPACE_ID.to_owned()
    } else {
        identifier.to_owned()
    }
}
