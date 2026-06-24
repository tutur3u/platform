use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Path matching: /api/v1/workspaces/:wsId/tulearn/marks
const TULEARN_MARKS_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TULEARN_MARKS_PATH_SUFFIX: &str = "/tulearn/marks";

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_ENABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";
const LOAD_FAILED_MESSAGE: &str = "Failed to load marks";

// Limits mirroring the legacy TS service.
const ASSIGNED_COURSES_LIMIT: Option<usize> = None;
const MARKS_LIMIT: i64 = 24;

#[derive(Serialize)]
struct TulearnMarksResponse {
    marks: Vec<Value>,
}

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
struct AssignedCourseRow {
    group_id: Option<String>,
}

// Embedded join row for marks. The PostgREST embed of `user_group_metrics`
// (and nested `workspace_user_groups`) may deserialize as an object or, when
// the relationship is to-many, an array. Use `EmbedOrList` to accept both.
#[derive(Deserialize)]
struct MarkRow {
    indicator_id: Option<String>,
    value: Option<f64>,
    created_at: Option<String>,
    user_group_metrics: Option<EmbedOrList<MetricEmbed>>,
}

#[derive(Deserialize)]
struct MetricEmbed {
    id: Option<String>,
    name: Option<String>,
    unit: Option<String>,
    workspace_user_groups: Option<EmbedOrList<CourseEmbed>>,
}

#[derive(Deserialize)]
struct CourseEmbed {
    id: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum EmbedOrList<T> {
    One(Box<T>),
    Many(Vec<T>),
}

impl<T> EmbedOrList<T> {
    fn first(self) -> Option<T> {
        match self {
            EmbedOrList::One(value) => Some(*value),
            EmbedOrList::Many(values) => values.into_iter().next(),
        }
    }
}

// Resolved learner subject, mirroring resolveTulearnSubject.
struct TulearnSubject {
    ws_id: String,
    student_workspace_user_id: String,
}

pub(crate) async fn handle_workspaces_tulearn_marks_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = tulearn_marks_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tulearn_marks_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tulearn_marks_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the session user (Supabase auth).
    let Some(access_token) = supabase_auth::request_access_token(request) else {
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

    // resolveTulearnSubject
    let subject = match resolve_tulearn_subject(
        contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        &access_token,
        student_id.as_deref(),
    )
    .await
    {
        Ok(SubjectOutcome::Subject(subject)) => subject,
        Ok(SubjectOutcome::NotEnabled) => return message_response(404, NOT_ENABLED_MESSAGE),
        Ok(SubjectOutcome::NoLearnerAccess) => {
            return message_response(403, NO_LEARNER_ACCESS_MESSAGE);
        }
        Err(()) => return message_response(500, LOAD_FAILED_MESSAGE),
    };

    // getLearnerMarks
    match learner_marks(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(marks) => no_store_response(json_response(200, TulearnMarksResponse { marks })),
        Err(()) => message_response(500, LOAD_FAILED_MESSAGE),
    }
}

enum SubjectOutcome {
    Subject(TulearnSubject),
    NotEnabled,
    NoLearnerAccess,
}

async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
    student_id: Option<&str>,
) -> Result<SubjectOutcome, ()> {
    let normalized_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token).await?;

    if !education_enabled(contact_data, outbound, &normalized_ws_id).await? {
        return Ok(SubjectOutcome::NotEnabled);
    }

    // Self student lookup (workspace_user_linked_users).
    let self_student =
        self_student_workspace_user_id(contact_data, outbound, user_id, &normalized_ws_id).await?;

    if student_id.is_none()
        && let Some(self_workspace_user_id) = self_student
    {
        return Ok(SubjectOutcome::Subject(TulearnSubject {
            ws_id: normalized_ws_id,
            student_workspace_user_id: self_workspace_user_id,
        }));
    }

    // Parent link lookup (tulearn_parent_student_links).
    let parent_link = parent_student_link(
        contact_data,
        outbound,
        &normalized_ws_id,
        user_id,
        student_id,
    )
    .await?;

    match parent_link.and_then(|row| row.student_workspace_user_id) {
        Some(student_workspace_user_id) if !student_workspace_user_id.trim().is_empty() => {
            Ok(SubjectOutcome::Subject(TulearnSubject {
                ws_id: normalized_ws_id,
                student_workspace_user_id,
            }))
        }
        _ => Ok(SubjectOutcome::NoLearnerAccess),
    }
}

async fn education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
) -> Result<bool, ()> {
    let url = contact_data
        .rest_url(
            "workspace_secrets",
            &[
                ("select", "value".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("name", format!("eq.{ENABLE_EDUCATION_SECRET}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceSecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

async fn self_student_workspace_user_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    platform_user_id: &str,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    // workspace_user_linked_users joined with workspace_users!inner to mirror
    // resolveStudentForPlatformUser. We only need the virtual_user_id for marks.
    let url = contact_data
        .rest_url(
            "workspace_user_linked_users",
            &[
                (
                    "select",
                    "virtual_user_id,workspace_users!inner(id,ws_id)".to_owned(),
                ),
                ("platform_user_id", format!("eq.{platform_user_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("workspace_users.ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<LinkedUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id)
        .filter(|id| !id.trim().is_empty()))
}

async fn parent_student_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    parent_user_id: &str,
    student_id: Option<&str>,
) -> Result<Option<ParentLinkRow>, ()> {
    let mut params = vec![
        ("select", "student_workspace_user_id".to_owned()),
        ("ws_id", format!("eq.{ws_id}")),
        ("parent_user_id", format!("eq.{parent_user_id}")),
        ("status", "eq.active".to_owned()),
        ("order", "created_at.asc".to_owned()),
        ("limit", "1".to_owned()),
    ];
    if let Some(student_id) = student_id.filter(|value| !value.trim().is_empty()) {
        params.push(("student_workspace_user_id", format!("eq.{student_id}")));
    }

    let url = contact_data
        .rest_url("tulearn_parent_student_links", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ParentLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn learner_marks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<Value>, ()> {
    let course_ids =
        assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!("in.({})", course_ids.join(","));
    let url = contact_data
        .rest_url(
            "user_indicators",
            &[
                (
                    "select",
                    "indicator_id,value,created_at,user_group_metrics!inner(id,name,unit,group_id,ws_id,workspace_user_groups(id,name))"
                        .to_owned(),
                ),
                ("user_id", format!("eq.{student_workspace_user_id}")),
                ("user_group_metrics.ws_id", format!("eq.{ws_id}")),
                ("user_group_metrics.group_id", in_filter),
                ("order", "created_at.desc".to_owned()),
                ("limit", MARKS_LIMIT.to_string()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows = response.json::<Vec<MarkRow>>().map_err(|_| ())?;

    Ok(rows
        .into_iter()
        .map(|mark| map_mark(mark, student_workspace_user_id))
        .collect())
}

fn map_mark(mark: MarkRow, student_workspace_user_id: &str) -> Value {
    let indicator_id = mark.indicator_id.unwrap_or_default();
    let metric = mark.user_group_metrics.and_then(EmbedOrList::first);
    let course = metric
        .as_ref()
        .and_then(|metric| metric.workspace_user_groups.as_ref())
        .and_then(|embed| match embed {
            EmbedOrList::One(value) => Some(CourseEmbed {
                id: value.id.clone(),
                name: value.name.clone(),
            }),
            EmbedOrList::Many(values) => values.first().map(|value| CourseEmbed {
                id: value.id.clone(),
                name: value.name.clone(),
            }),
        });

    let metric_id = metric
        .as_ref()
        .and_then(|metric| metric.id.clone())
        .unwrap_or_else(|| indicator_id.clone());
    let metric_name = metric.as_ref().and_then(|metric| metric.name.clone());
    let metric_unit = metric.as_ref().and_then(|metric| metric.unit.clone());

    let course_value = match course {
        Some(course) => json!({
            "id": course.id,
            "name": course.name,
        }),
        None => Value::Null,
    };

    json!({
        "id": format!("{indicator_id}:{student_workspace_user_id}"),
        "value": mark.value,
        "created_at": mark.created_at,
        "metric": {
            "id": metric_id,
            "name": metric_name,
            "unit": metric_unit,
        },
        "course": course_value,
    })
}

async fn assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<String>, ()> {
    let mut params = vec![
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
    ];
    if let Some(limit) = ASSIGNED_COURSES_LIMIT {
        params.push(("limit", limit.to_string()));
    }

    let url = contact_data
        .rest_url("workspace_user_groups_users", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<AssignedCourseRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .filter(|id| !id.trim().is_empty())
        .collect())
}

// ---------------------------------------------------------------------------
// Workspace id normalization (copied from workspace_habits_access.rs because
// those helpers are private there; self-contained to avoid editing that file).
// ---------------------------------------------------------------------------

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
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;
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
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
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
    let url = contact_data
        .rest_url(
            "workspaces",
            &[
                ("select", "id".to_owned()),
                ("handle", format!("eq.{handle}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;

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

async fn send_service_role_request(
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

// ---------------------------------------------------------------------------
// Path + identifier helpers
// ---------------------------------------------------------------------------

fn tulearn_marks_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TULEARN_MARKS_PATH_PREFIX)?
        .strip_suffix(TULEARN_MARKS_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn student_id_param(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    url.query_pairs().find_map(|(key, value)| {
        (key == "studentId" && !value.trim().is_empty()).then(|| value.into_owned())
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
