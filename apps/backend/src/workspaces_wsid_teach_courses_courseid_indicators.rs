//! Handler for `GET /api/v1/workspaces/:wsId/teach/courses/:courseId/indicators`.
//!
//! Ports the GET handler of the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/teach/courses/[courseId]/indicators/route.ts`.
//! The legacy route also exposes POST and PATCH handlers; only GET is ported here.
//! Every non-GET method returns `None` so the worker falls through to the still-live
//! Next.js route.
//!
//! The legacy GET flow is:
//!
//!   1. Resolve/normalize the workspace id and verify the `view_user_groups_scores`
//!      workspace permission via `requireTeachWorkspaceAccess`.
//!   2. Validate the course exists in `workspace_user_groups` (matching the resolved
//!      `ws_id` and `is_guest = false`), returning 404 if absent.
//!   3. Fetch indicators from `user_group_metrics` filtered by `group_id = courseId`,
//!      ordered by `created_at` ascending.
//!   4. Fetch values from `user_indicators` joined with `user_group_metrics!inner`
//!      filtered by `user_group_metrics.group_id = courseId`.
//!   5. Return `{ indicators: [...], values: [...] }`.
//!
//! Auth is delegated to
//! `workspace_permission_check::authorize_workspace_permission`, which handles
//! workspace-id normalization, membership lookup, and the permission check.
//!
//! BEHAVIOR GAPS vs legacy:
//!   * The legacy route allows `allowAppSessionAuth: { targetApp: 'teach' }` (teach
//!     app-session bearer tokens). The shared auth helper does not support
//!     app-session tokens; only standard session auth is handled here.
//!   * The legacy route distinguishes several auth failure modes with slightly
//!     different messages. This handler maps `Unauthorized` -> 401, `NotFound` ->
//!     403 with workspace-access message, `Forbidden` -> 403 with insufficient-
//!     permissions message, and `Internal` -> 500.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    workspace_permission_check::{
        WorkspacePermissionAuthorizationError, authorize_workspace_permission,
    },
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_TEACH_COURSES_SEG: &str = "/teach/courses/";
const PATH_SUFFIX: &str = "/indicators";
const VIEW_PERMISSION: &str = "view_user_groups_scores";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NO_ACCESS_MESSAGE: &str = "You don't have access to this workspace";
const FORBIDDEN_MESSAGE: &str = "Insufficient permissions";
const VERIFY_FAILED_MESSAGE: &str = "Failed to verify workspace access";
const COURSE_NOT_FOUND_MESSAGE: &str = "Course not found";
const INDICATORS_ERROR_MESSAGE: &str = "Error fetching indicators";
const VALUES_ERROR_MESSAGE: &str = "Error fetching indicator values";

#[derive(Deserialize)]
struct MetricRow {
    #[serde(default)]
    id: Value,
    #[serde(default)]
    name: Value,
    #[serde(default)]
    factor: Value,
    #[serde(default)]
    unit: Value,
    #[serde(default)]
    is_weighted: Value,
    #[serde(default)]
    created_at: Value,
}

#[derive(Deserialize)]
struct IndicatorValueRow {
    #[serde(default)]
    user_id: Value,
    #[serde(default)]
    indicator_id: Value,
    #[serde(default)]
    value: Value,
}

#[derive(Deserialize)]
struct CourseCheckRow {
    #[allow(dead_code)]
    id: Option<String>,
}

pub(crate) async fn handle_workspaces_wsid_teach_courses_courseid_indicators_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let (raw_ws_id, raw_course_id) = extract_path_params(request.path)?;

    Some(match request.method {
        "GET" => indicators_response(config, request, raw_ws_id, raw_course_id, outbound).await,
        _ => return None,
    })
}

async fn indicators_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let authorization = match authorize_workspace_permission(
        contact_data,
        request,
        raw_ws_id,
        VIEW_PERMISSION,
        outbound,
    )
    .await
    {
        Ok(authorization) => authorization,
        Err(WorkspacePermissionAuthorizationError::Unauthorized) => {
            return message_response(401, UNAUTHORIZED_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::NotFound) => {
            return message_response(403, NO_ACCESS_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Forbidden) => {
            return message_response(403, FORBIDDEN_MESSAGE);
        }
        Err(WorkspacePermissionAuthorizationError::Internal) => {
            return message_response(500, VERIFY_FAILED_MESSAGE);
        }
    };

    let ws_id = &authorization.ws_id;

    match validate_course(contact_data, outbound, ws_id, course_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, COURSE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, VERIFY_FAILED_MESSAGE),
    }

    let metrics = match fetch_metrics(contact_data, outbound, course_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, INDICATORS_ERROR_MESSAGE),
    };

    let values = match fetch_indicator_values(contact_data, outbound, course_id).await {
        Ok(rows) => rows,
        Err(()) => return message_response(500, VALUES_ERROR_MESSAGE),
    };

    no_store_response(json_response(
        200,
        json!({
            "indicators": metrics.into_iter().map(metric_to_json).collect::<Vec<_>>(),
            "values": values.into_iter().map(value_to_json).collect::<Vec<_>>(),
        }),
    ))
}

async fn validate_course(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    course_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id".to_owned()),
                ("id", format!("eq.{course_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("is_guest", "eq.false".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<CourseCheckRow>>().map_err(|_| ())?;
    Ok(!rows.is_empty())
}

async fn fetch_metrics(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
) -> Result<Vec<MetricRow>, ()> {
    let url = contact_data
        .rest_url(
            "user_group_metrics",
            &[
                (
                    "select",
                    "id,name,factor,unit,is_weighted,created_at".to_owned(),
                ),
                ("group_id", format!("eq.{course_id}")),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<MetricRow>>().map_err(|_| ())
}

async fn fetch_indicator_values(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
) -> Result<Vec<IndicatorValueRow>, ()> {
    // PostgREST embedded-resource filter: `!inner` join on user_group_metrics,
    // then scope to the course with the `user_group_metrics.group_id` column filter.
    let url = contact_data
        .rest_url(
            "user_indicators",
            &[
                (
                    "select",
                    "user_id,indicator_id,value,user_group_metrics!inner(group_id)".to_owned(),
                ),
                ("user_group_metrics.group_id", format!("eq.{course_id}")),
            ],
        )
        .ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let bearer = format!("Bearer {service_role_key}");

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &bearer)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<IndicatorValueRow>>().map_err(|_| ())
}

fn metric_to_json(row: MetricRow) -> Value {
    json!({
        "id": row.id,
        "name": row.name,
        "factor": row.factor,
        "unit": row.unit,
        "is_weighted": row.is_weighted,
        "created_at": row.created_at,
    })
}

fn value_to_json(row: IndicatorValueRow) -> Value {
    json!({
        "indicator_id": row.indicator_id,
        "user_id": row.user_id,
        "value": row.value,
    })
}

/// Extracts `(ws_id, course_id)` from a path matching
/// `/api/v1/workspaces/<wsId>/teach/courses/<courseId>/indicators`.
/// Returns `None` for any path that does not match.
fn extract_path_params(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(PATH_PREFIX)?;
    // Split off wsId at the first '/'
    let slash_pos = rest.find('/')?;
    let ws_id = &rest[..slash_pos];
    if ws_id.is_empty() {
        return None;
    }
    let after_ws = &rest[slash_pos..]; // starts with '/'
    // Remaining must be "/teach/courses/<courseId>/indicators"
    let after_teach = after_ws.strip_prefix(PATH_TEACH_COURSES_SEG)?;
    let course_id = after_teach.strip_suffix(PATH_SUFFIX)?;
    if course_id.is_empty() || course_id.contains('/') {
        return None;
    }
    Some((ws_id, course_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_params_valid_uuid_path() {
        assert_eq!(
            extract_path_params(
                "/api/v1/workspaces/aaaaaaaa-0000-0000-0000-000000000001/teach/courses/bbbbbbbb-0000-0000-0000-000000000002/indicators"
            ),
            Some((
                "aaaaaaaa-0000-0000-0000-000000000001",
                "bbbbbbbb-0000-0000-0000-000000000002"
            ))
        );
    }

    #[test]
    fn extract_params_valid_slug_path() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-123/teach/courses/course-abc/indicators"),
            Some(("ws-123", "course-abc"))
        );
    }

    #[test]
    fn extract_params_rejects_wrong_suffix() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-123/teach/courses/course-abc/members"),
            None
        );
    }

    #[test]
    fn extract_params_rejects_wrong_prefix() {
        assert_eq!(
            extract_path_params("/api/workspaces/ws-123/teach/courses/course-abc/indicators"),
            None
        );
    }

    #[test]
    fn extract_params_rejects_empty_ws_id() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces//teach/courses/course-abc/indicators"),
            None
        );
    }

    #[test]
    fn extract_params_rejects_empty_course_id() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-123/teach/courses//indicators"),
            None
        );
    }

    #[test]
    fn extract_params_rejects_extra_segments_before_teach() {
        // e.g. extra path segment between wsId and /teach/courses/
        assert_eq!(
            extract_path_params(
                "/api/v1/workspaces/ws-123/extra/teach/courses/course-abc/indicators"
            ),
            None
        );
    }

    #[test]
    fn extract_params_rejects_trailing_slash() {
        assert_eq!(
            extract_path_params("/api/v1/workspaces/ws-123/teach/courses/course-abc/indicators/"),
            None
        );
    }

    #[test]
    fn metric_to_json_preserves_fields() {
        let row = MetricRow {
            id: json!("m-1"),
            name: json!("Score"),
            factor: json!(1.5),
            unit: json!("pts"),
            is_weighted: json!(true),
            created_at: json!("2024-01-01T00:00:00Z"),
        };
        let result = metric_to_json(row);
        assert_eq!(result["id"], json!("m-1"));
        assert_eq!(result["name"], json!("Score"));
        assert_eq!(result["factor"], json!(1.5));
        assert_eq!(result["unit"], json!("pts"));
        assert_eq!(result["is_weighted"], json!(true));
        assert_eq!(result["created_at"], json!("2024-01-01T00:00:00Z"));
    }

    #[test]
    fn value_to_json_preserves_fields() {
        let row = IndicatorValueRow {
            indicator_id: json!("i-1"),
            user_id: json!("u-1"),
            value: json!(42.5),
        };
        let result = value_to_json(row);
        assert_eq!(result["indicator_id"], json!("i-1"));
        assert_eq!(result["user_id"], json!("u-1"));
        assert_eq!(result["value"], json!(42.5));
    }

    #[test]
    fn value_to_json_allows_null_value() {
        let row = IndicatorValueRow {
            indicator_id: json!("i-2"),
            user_id: json!("u-2"),
            value: Value::Null,
        };
        let result = value_to_json(row);
        assert_eq!(result["value"], Value::Null);
    }
}
