//! route_predicates helpers extracted from `lib.rs` (pure movement).

use crate::*;

pub(crate) fn is_well_known_path(path: &str) -> bool {
    path.starts_with("/.well-known/")
}

pub(crate) fn is_serwist_route_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 2 && segments[0] == "serwist" && !segments[1].is_empty()
}

pub(crate) fn is_retired_share_course_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 4
        && segments[0] == "api"
        && segments[1] == "share"
        && segments[2] == "course"
        && !segments[3].is_empty()
}

pub(crate) fn is_auth_cors_preflight_path(path: &str) -> bool {
    AUTH_CORS_PREFLIGHT_PATHS.contains(&path)
}

pub(crate) fn is_bare_auth_preflight_path(path: &str) -> bool {
    BARE_AUTH_PREFLIGHT_PATHS.contains(&path)
        || is_qr_login_challenge_path(path)
        || is_mfa_mobile_challenge_path(path)
}

pub(crate) fn is_qr_login_challenge_path(path: &str) -> bool {
    let segments = path_segments(path);

    (segments.len() == 6 || (segments.len() == 7 && segments[6] == "approve"))
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "auth"
        && segments[3] == "qr-login"
        && segments[4] == "challenges"
        && !segments[5].is_empty()
}

pub(crate) fn is_mfa_mobile_challenge_path(path: &str) -> bool {
    let segments = path_segments(path);

    (segments.len() == 7 || (segments.len() == 8 && segments[7] == "approve"))
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "auth"
        && segments[3] == "mfa"
        && segments[4] == "mobile"
        && segments[5] == "challenges"
        && !segments[6].is_empty()
}

pub(crate) fn is_workspace_slides_collection_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 5
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "slides"
        && !segments[3].is_empty()
}

pub(crate) fn is_obsolete_workspace_migration_method(method: &str, path: &str) -> bool {
    obsolete_workspace_migration_allowed_methods(path).is_some_and(|allowed| {
        allowed
            .split(", ")
            .any(|allowed_method| allowed_method == method)
    })
}

pub(crate) fn is_obsolete_workspace_migration_path(path: &str) -> bool {
    obsolete_workspace_migration_allowed_methods(path).is_some()
}

pub(crate) fn is_retired_workspace_data_migration_method(method: &str, path: &str) -> bool {
    retired_workspace_data_migration_route(path).is_some_and(|(allowed, _)| {
        allowed
            .split(", ")
            .any(|allowed_method| allowed_method == method)
    })
}

pub(crate) fn is_retired_workspace_data_migration_path(path: &str) -> bool {
    retired_workspace_data_migration_route(path).is_some()
}

pub(crate) fn is_obsolete_infrastructure_migration_method(method: &str, path: &str) -> bool {
    obsolete_infrastructure_migration_allowed_methods(path).is_some_and(|allowed| {
        allowed
            .split(", ")
            .any(|allowed_method| allowed_method == method)
    })
}

pub(crate) fn is_obsolete_infrastructure_migration_path(path: &str) -> bool {
    obsolete_infrastructure_migration_allowed_methods(path).is_some()
}

pub(crate) fn is_workspace_slide_item_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 6
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "slides"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
}

pub(crate) fn is_webgl_package_upload_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "external-projects"
        && segments[5] == "webgl-packages"
        && segments[6] == "upload"
        && !segments[3].is_empty()
}

pub(crate) fn is_group_check_email_path(path: &str) -> bool {
    let segments = path_segments(path);

    segments.len() == 9
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && segments[4] == "user-groups"
        && segments[6] == "group-checks"
        && segments[8] == "email"
        && !segments[3].is_empty()
        && !segments[5].is_empty()
        && !segments[7].is_empty()
}
