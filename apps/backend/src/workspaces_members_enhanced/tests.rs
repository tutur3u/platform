use serde_json::json;

use super::*;

#[test]
fn authorization_errors_do_not_reveal_workspace_handles() {
    for error in [
        WorkspacePermissionAuthorizationError::Forbidden,
        WorkspacePermissionAuthorizationError::NotFound,
        WorkspacePermissionAuthorizationError::Unauthorized,
    ] {
        let response = authorization_error_response(error, "private-team");

        assert_eq!(response.status, 404);
        assert_eq!(
            response.body,
            json!({ "error": WORKSPACE_NOT_FOUND_MESSAGE })
        );
    }
}

#[test]
fn authorization_errors_preserve_uuid_status_codes() {
    let response = authorization_error_response(
        WorkspacePermissionAuthorizationError::Forbidden,
        "11111111-1111-4111-8111-111111111111",
    );

    assert_eq!(response.status, 403);
    assert_eq!(response.body, json!({ "error": FORBIDDEN_MESSAGE }));
}
