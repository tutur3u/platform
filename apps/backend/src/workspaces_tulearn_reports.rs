use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const PRIVATE_SCHEMA: &str = "private";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FAILED_TO_LOAD_REPORTS_MESSAGE: &str = "Failed to load reports";
const TULEARN_NOT_ENABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";

const WORKSPACES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const REPORTS_PATH_SUFFIX: &str = "/tulearn/reports";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSecretRow {
    value: Option<String>,
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
}

#[derive(Deserialize)]
struct ParentLinkRow {
    student_workspace_user_id: Option<String>,
}

#[derive(Deserialize)]
struct CourseGroupRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct MonthlyReportRow {
    id: Option<String>,
    title: Option<String>,
    content: Option<String>,
    #[serde(default)]
    feedback: Value,
    #[serde(default)]
    score: Value,
    created_at: Option<String>,
    group_id: Option<String>,
    group_name: Option<String>,
}

pub(crate) async fn handle_workspaces_tulearn_reports_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = reports_route_ws_id(request.path)?;

    Some(match request.method {
        "GET" => reports_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn reports_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let student_id = student_id_param(request.url);

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, FAILED_TO_LOAD_REPORTS_MESSAGE),
        };

    // Education must be enabled for the workspace.
    match education_enabled(contact_data, outbound, &resolved_ws_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(404, TULEARN_NOT_ENABLED_MESSAGE),
        Err(()) => return message_response(500, FAILED_TO_LOAD_REPORTS_MESSAGE),
    }

    // Resolve the subject student (self or via parent link).
    let student_workspace_user_id = match resolve_subject_student(
        contact_data,
        outbound,
        &resolved_ws_id,
        &user_id,
        student_id.as_deref(),
    )
    .await
    {
        Ok(Some(id)) => id,
        Ok(None) => return message_response(403, NO_LEARNER_ACCESS_MESSAGE),
        Err(()) => return message_response(500, FAILED_TO_LOAD_REPORTS_MESSAGE),
    };

    let course_ids = match assigned_course_ids(
        contact_data,
        outbound,
        &resolved_ws_id,
        &student_workspace_user_id,
    )
    .await
    {
        Ok(ids) => ids,
        Err(()) => return message_response(500, FAILED_TO_LOAD_REPORTS_MESSAGE),
    };

    if course_ids.is_empty() {
        return reports_ok(Vec::new());
    }

    match learner_reports(
        contact_data,
        outbound,
        &resolved_ws_id,
        &student_workspace_user_id,
        &course_ids,
    )
    .await
    {
        Ok(reports) => reports_ok(reports),
        Err(()) => message_response(500, FAILED_TO_LOAD_REPORTS_MESSAGE),
    }
}

/// Resolve the student workspace user id for the request.
///
/// Mirrors `resolveTulearnSubject`: when no `studentId` is supplied and the
/// caller themself is linked to a workspace user, that self student is used.
/// Otherwise an active parent-student link is required (optionally filtered by
/// the requested `studentId`).
///
/// Returns `Ok(None)` when no learner is accessible (403 in the legacy route).
async fn resolve_subject_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    student_id: Option<&str>,
) -> Result<Option<String>, ()> {
    if student_id.is_none()
        && let Some(self_student) =
            self_student_workspace_user_id(contact_data, outbound, ws_id, user_id).await?
    {
        return Ok(Some(self_student));
    }

    parent_linked_student(contact_data, outbound, ws_id, user_id, student_id).await
}

async fn self_student_workspace_user_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "virtual_user_id".to_owned()),
            ("platform_user_id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LinkedUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id))
}

async fn parent_linked_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    student_id: Option<&str>,
) -> Result<Option<String>, ()> {
    let mut params = vec![
        ("select", "student_workspace_user_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("parent_user_id", format!("eq.{user_id}")),
        ("status", "eq.active".to_owned()),
        ("order", "created_at.asc".to_owned()),
        ("limit", "1".to_owned()),
    ];
    if let Some(student_id) = student_id {
        params.push(("student_workspace_user_id", format!("eq.{student_id}")));
    }

    let Some(url) = contact_data.rest_url("tulearn_parent_student_links", &params) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ParentLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.student_workspace_user_id))
}

async fn education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_secrets",
        &[
            ("select", "value".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .map(|value| value.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false))
}

async fn assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            (
                "select",
                "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,archived,is_guest,is_course_published)"
                    .to_owned(),
            ),
            ("user_id", format!("eq.{student_workspace_user_id}")),
            ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
            ("workspace_user_groups.archived", "eq.false".to_owned()),
            ("workspace_user_groups.is_guest", "eq.false".to_owned()),
            (
                "workspace_user_groups.is_course_published",
                "eq.true".to_owned(),
            ),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, false).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<CourseGroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .collect())
}

async fn learner_reports(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
    course_ids: &[String],
) -> Result<Vec<Value>, ()> {
    let in_filter = format!("in.({})", course_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "external_user_monthly_reports_workspace_view",
        &[
            (
                "select",
                "id,title,content,feedback,score,created_at,group_id,group_name".to_owned(),
            ),
            ("user_id", format!("eq.{student_workspace_user_id}")),
            ("group_id", in_filter),
            ("user_ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "12".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_rest_request(contact_data, outbound, &url, true).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<MonthlyReportRow>>()
        .map_err(|_| ())?
        .into_iter()
        .map(map_report)
        .collect())
}

fn map_report(report: MonthlyReportRow) -> Value {
    let course = match report.group_name {
        Some(name) => json!({ "id": report.group_id, "name": name }),
        None => Value::Null,
    };

    json!({
        "id": report.id,
        "title": report.title,
        "content": report.content,
        "feedback": normalize_optional(report.feedback),
        "score": normalize_optional(report.score),
        "created_at": report.created_at,
        "course": course,
    })
}

/// Mirror the `?? null` coalescing used in the legacy mapper so missing values
/// serialize as JSON null.
fn normalize_optional(value: Value) -> Value {
    if value.is_null() { Value::Null } else { value }
}

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
    let response = send_service_role_rest_request(contact_data, outbound, &url, false).await?;

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
    private_schema: bool,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut outbound_request = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);

    if private_schema {
        outbound_request = outbound_request
            .with_header("Accept-Profile", PRIVATE_SCHEMA)
            .with_header("Content-Profile", PRIVATE_SCHEMA);
    }

    outbound.send(outbound_request).await.map_err(|_| ())
}

fn reports_route_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_PATH_PREFIX)?
        .strip_suffix(REPORTS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn student_id_param(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;

    url.query_pairs().find_map(|(key, value)| {
        if key == "studentId" {
            let value = value.trim();
            (!value.is_empty()).then(|| value.to_owned())
        } else {
            None
        }
    })
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

fn reports_ok(reports: Vec<Value>) -> BackendResponse {
    no_store_response(json_response(200, json!({ "reports": reports })))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
