use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const TULEARN_COURSES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TULEARN_COURSES_PATH_SUFFIX: &str = "/tulearn/courses";

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const NOT_ENABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load courses";

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct CourseSummary {
    id: String,
    name: String,
    description: Option<String>,
    #[serde(rename = "completedModules")]
    completed_modules: u32,
    #[serde(rename = "totalModules")]
    total_modules: u32,
    progress: i64,
}

#[derive(Serialize)]
struct CoursesResponse {
    courses: Vec<CourseSummary>,
}

// ---------------------------------------------------------------------------
// Deserialize rows
// ---------------------------------------------------------------------------

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
    student_platform_user_id: Option<String>,
    student_workspace_user_id: Option<String>,
}

#[derive(Deserialize)]
struct AssignedGroupRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct CourseRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct ModuleRow {
    id: Option<String>,
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct CompletionRow {
    module_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Subject resolution result
// ---------------------------------------------------------------------------

struct TulearnSubject {
    ws_id: String,
    student_platform_user_id: String,
    student_workspace_user_id: String,
}

enum AccessError {
    /// 404 — Tulearn not enabled for workspace.
    NotEnabled,
    /// 403 — caller has no access to the requested learner.
    Forbidden,
    /// 500 — internal failure (DB/transport error).
    Internal,
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_tulearn_courses_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = tulearn_courses_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tulearn_courses_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tulearn_courses_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // ---- Authenticate caller (supabase session OR app session). ------------
    let Some((user_id, access_token)) = resolve_caller(config, request, outbound).await else {
        return message_response(401, "Unauthorized");
    };

    let student_id = query_value(request.url, "studentId");

    let subject = match resolve_tulearn_subject(
        contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        access_token.as_deref(),
        student_id.as_deref(),
    )
    .await
    {
        Ok(subject) => subject,
        Err(AccessError::NotEnabled) => return message_response(404, NOT_ENABLED_MESSAGE),
        Err(AccessError::Forbidden) => return message_response(403, NO_LEARNER_ACCESS_MESSAGE),
        Err(AccessError::Internal) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    match learner_course_summaries(contact_data, outbound, &subject).await {
        Ok(courses) => no_store_response(json_response(200, CoursesResponse { courses })),
        Err(()) => message_response(500, FAILED_TO_LOAD_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Caller authentication
// ---------------------------------------------------------------------------

/// Resolves the caller identity. Returns (platform_user_id, access_token).
/// `access_token` is `Some` only for supabase-session callers (used for the
/// caller-scoped workspace-handle lookup); app-session callers fall back to
/// service-role lookups only.
async fn resolve_caller(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(String, Option<String>)> {
    // App session token path (allowAppSessionAuth: true).
    if contact::request_has_app_session_token(request) {
        let identity = contact::resolve_app_session_identity(
            config,
            request,
            contact::current_user_app_session_targets(),
        )
        .ok()?;
        let id = identity.id.trim().to_owned();
        if id.is_empty() {
            return None;
        }
        return Some((id, None));
    }

    // Supabase session (bearer or cookie).
    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user_id =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))?;

    Some((user_id, Some(access_token)))
}

// ---------------------------------------------------------------------------
// Subject resolution (mirrors resolveTulearnSubject)
// ---------------------------------------------------------------------------

async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: Option<&str>,
    student_id: Option<&str>,
) -> Result<TulearnSubject, AccessError> {
    let ws_id = normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token)
        .await
        .map_err(|()| AccessError::Internal)?;

    if !education_enabled(contact_data, outbound, &ws_id)
        .await
        .map_err(|()| AccessError::Internal)?
    {
        return Err(AccessError::NotEnabled);
    }

    // Trim the studentId param like the JS searchParams.get() (empty string
    // -> treated as present-but-empty; the JS code uses it truthy-checked).
    let student_id = student_id.filter(|value| !value.is_empty());

    // Self-student lookup (only relevant when no studentId is requested).
    if student_id.is_none()
        && let Some(self_workspace_user_id) =
            resolve_self_student(contact_data, outbound, user_id, &ws_id)
                .await
                .map_err(|()| AccessError::Internal)?
    {
        return Ok(TulearnSubject {
            ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: self_workspace_user_id,
        });
    }

    // Parent link lookup.
    let link = resolve_parent_link(contact_data, outbound, user_id, &ws_id, student_id)
        .await
        .map_err(|()| AccessError::Internal)?;

    let Some(link) = link else {
        return Err(AccessError::Forbidden);
    };

    let (Some(platform_user_id), Some(workspace_user_id)) = (
        link.student_platform_user_id,
        link.student_workspace_user_id,
    ) else {
        return Err(AccessError::Forbidden);
    };

    Ok(TulearnSubject {
        ws_id,
        student_platform_user_id: platform_user_id,
        student_workspace_user_id: workspace_user_id,
    })
}

async fn resolve_self_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    platform_user_id: &str,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    // workspace_user_linked_users joined to workspace_users!inner, but we only
    // need virtual_user_id; the inner join guarantees the workspace_user exists.
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            (
                "select",
                "virtual_user_id,workspace_users!inner(id,ws_id)".to_owned(),
            ),
            ("platform_user_id", format!("eq.{platform_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = service_role_get(contact_data, outbound, &url).await?;
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

async fn resolve_parent_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    parent_user_id: &str,
    ws_id: &str,
    student_id: Option<&str>,
) -> Result<Option<ParentLinkRow>, ()> {
    let mut params = vec![
        (
            "select",
            "student_platform_user_id,student_workspace_user_id".to_owned(),
        ),
        ("ws_id", format!("eq.{ws_id}")),
        ("parent_user_id", format!("eq.{parent_user_id}")),
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

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ParentLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
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

    let response = service_role_get(contact_data, outbound, &url).await?;
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

// ---------------------------------------------------------------------------
// Course summaries (mirrors getLearnerCourseSummaries)
// ---------------------------------------------------------------------------

async fn learner_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    subject: &TulearnSubject,
) -> Result<Vec<CourseSummary>, ()> {
    let course_ids = assigned_course_ids(
        contact_data,
        outbound,
        &subject.student_workspace_user_id,
        &subject.ws_id,
    )
    .await?;

    if course_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!("in.({})", course_ids.join(","));

    // Courses ordered by name asc.
    let Some(courses_url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name,description".to_owned()),
            ("ws_id", format!("eq.{}", subject.ws_id)),
            ("id", in_filter.clone()),
            ("order", "name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    // Published modules for the assigned courses.
    let Some(modules_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "id,group_id".to_owned()),
            ("group_id", in_filter.clone()),
            ("is_published", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    // Completed module ids for the student platform user.
    let Some(completions_url) = contact_data.rest_url(
        "course_module_completion_status",
        &[
            ("select", "module_id".to_owned()),
            (
                "user_id",
                format!("eq.{}", subject.student_platform_user_id),
            ),
            ("completion_status", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let courses_response = service_role_get(contact_data, outbound, &courses_url).await?;
    if !(200..300).contains(&courses_response.status) {
        return Err(());
    }
    let courses = courses_response.json::<Vec<CourseRow>>().map_err(|_| ())?;

    let modules_response = service_role_get(contact_data, outbound, &modules_url).await?;
    if !(200..300).contains(&modules_response.status) {
        return Err(());
    }
    let modules = modules_response.json::<Vec<ModuleRow>>().map_err(|_| ())?;

    let completions_response = service_role_get(contact_data, outbound, &completions_url).await?;
    if !(200..300).contains(&completions_response.status) {
        return Err(());
    }
    let completions = completions_response
        .json::<Vec<CompletionRow>>()
        .map_err(|_| ())?;

    let completed_module_ids: HashSet<String> = completions
        .into_iter()
        .filter_map(|row| row.module_id)
        .collect();

    let mut modules_by_course: HashMap<String, Vec<String>> = HashMap::new();
    for module in modules {
        let (Some(id), Some(group_id)) = (module.id, module.group_id) else {
            continue;
        };
        modules_by_course.entry(group_id).or_default().push(id);
    }

    let summaries = courses
        .into_iter()
        .filter_map(|course| {
            let id = course.id?;
            let name = course.name.unwrap_or_default();
            let module_ids = modules_by_course.get(&id);
            let total_modules = module_ids.map_or(0, |ids| ids.len());
            let completed_modules = module_ids.map_or(0, |ids| {
                ids.iter()
                    .filter(|module_id| completed_module_ids.contains(*module_id))
                    .count()
            });

            let progress = if total_modules > 0 {
                // Math.round((completed / total) * 100)
                ((completed_modules as f64 / total_modules as f64) * 100.0).round() as i64
            } else {
                0
            };

            Some(CourseSummary {
                id,
                name,
                description: course.description,
                completed_modules: completed_modules as u32,
                total_modules: total_modules as u32,
                progress,
            })
        })
        .collect();

    Ok(summaries)
}

async fn assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_workspace_user_id: &str,
    ws_id: &str,
) -> Result<Vec<String>, ()> {
    // Mirrors getAssignedCourseIds: workspace_user_groups_users joined to
    // workspace_user_groups (inner) filtered on ws_id/archived/is_guest/
    // is_course_published.
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

    let response = service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<AssignedGroupRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .collect())
}

// ---------------------------------------------------------------------------
// Workspace id normalization (mirrors normalizeWorkspaceId)
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: Option<&str>,
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

        if let Some(access_token) = access_token
            && let Some(workspace_id) =
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
    access_token: Option<&str>,
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

    let response = match access_token {
        Some(access_token) => caller_get(contact_data, outbound, &url, access_token).await?,
        None => service_role_get(contact_data, outbound, &url).await?,
    };

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

    let response = caller_get(contact_data, outbound, &url, access_token).await?;
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

    let response = service_role_get(contact_data, outbound, &url).await?;
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

// ---------------------------------------------------------------------------
// REST request helpers
// ---------------------------------------------------------------------------

async fn caller_get(
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

async fn service_role_get(
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

fn tulearn_courses_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(TULEARN_COURSES_PATH_PREFIX)?
        .strip_suffix(TULEARN_COURSES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn query_value(request_url: Option<&str>, key: &str) -> Option<String> {
    let url = url::Url::parse(request_url?).ok()?;
    url.query_pairs()
        .find_map(|(name, value)| (name == key).then(|| value.into_owned()))
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
