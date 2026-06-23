use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// Mirrors apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/route.ts
//
// GET only. Resolves the Tulearn subject (self student or, optionally, a linked
// learner via ?studentId=) and returns the learner course detail. All Tulearn
// reads run with the service-role key (the legacy code uses createAdminClient /
// getAdmin). The caller access token is only used to resolve workspace handles,
// matching normalizeWorkspaceId in packages/utils.

const TULEARN_COURSES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const TULEARN_COURSES_PATH_INFIX: &str = "/tulearn/courses/";

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const TULEARN_NOT_ENABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";
const COURSE_NOT_FOUND_MESSAGE: &str = "Course not found";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load course";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";

// ---------------------------------------------------------------------------
// Response shapes (camelCase to match the legacy JSON contract)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct CourseModuleCounts {
    flashcards: u64,
    quizzes: u64,
    #[serde(rename = "quizSets")]
    quiz_sets: u64,
}

#[derive(Serialize)]
struct CourseModuleSummary {
    id: String,
    name: Option<String>,
    sort_key: Option<i64>,
    is_published: bool,
    completed: bool,
    locked: bool,
    counts: CourseModuleCounts,
}

#[derive(Serialize)]
struct CourseTestSummary {
    id: String,
    name: Option<String>,
    start_at: Option<String>,
    duration_in_minutes: Option<i64>,
    description: Option<String>,
    module_ids: Vec<String>,
}

#[derive(Serialize)]
struct CourseDetail {
    id: String,
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "completedModules")]
    completed_modules: u64,
    #[serde(rename = "totalModules")]
    total_modules: u64,
    progress: i64,
    modules: Vec<CourseModuleSummary>,
    tests: Vec<CourseTestSummary>,
}

// ---------------------------------------------------------------------------
// Supabase row shapes
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
struct CourseModuleRow {
    id: Option<String>,
    name: Option<String>,
    sort_key: Option<i64>,
    is_published: Option<bool>,
}

#[derive(Deserialize)]
struct ModuleIdRow {
    module_id: Option<String>,
}

#[derive(Deserialize)]
struct CourseTestRow {
    id: Option<String>,
    name: Option<String>,
    start_at: Option<String>,
    duration_in_minutes: Option<i64>,
    description: Option<String>,
    #[serde(default)]
    course_test_modules: Vec<TestModuleRow>,
}

#[derive(Deserialize)]
struct TestModuleRow {
    module_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Resolved subject
// ---------------------------------------------------------------------------

struct TulearnSubject {
    ws_id: String,
    student_platform_user_id: String,
    student_workspace_user_id: String,
}

enum SubjectError {
    /// Education not enabled (404) or learner access denied (403/404).
    Access(u16, &'static str),
    /// Unexpected supabase failure -> 500.
    Internal,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_tulearn_courses_2_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (raw_ws_id, course_id) = tulearn_course_path_segments(request.path)?;

    Some(match request.method {
        "GET" => tulearn_course_response(config, request, raw_ws_id, course_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tulearn_course_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Resolve the authenticated user (supabase session OR app session).
    let (user_id, access_token) = match resolve_user(config, request, outbound).await {
        Some(user) => user,
        None => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    let student_id = student_id_from_url(request.url);

    let subject = match resolve_tulearn_subject(
        contact_data,
        outbound,
        raw_ws_id,
        &user_id,
        student_id.as_deref(),
        access_token.as_deref(),
    )
    .await
    {
        Ok(subject) => subject,
        Err(SubjectError::Access(status, message)) => return message_response(status, message),
        Err(SubjectError::Internal) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    match get_learner_course_detail(contact_data, outbound, course_id, &subject).await {
        Ok(Some(course)) => no_store_response(json_response(200, course)),
        Ok(None) => message_response(404, COURSE_NOT_FOUND_MESSAGE),
        Err(()) => message_response(500, FAILED_TO_LOAD_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/// Returns (user_id, Some(access_token)) for supabase sessions, or
/// (user_id, None) for app sessions. Mirrors allowAppSessionAuth: true.
async fn resolve_user(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<(String, Option<String>)> {
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

    let access_token = supabase_auth::request_access_token_allowing_app_sessions(request)?;
    let user =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await?;
    let id = user.id.filter(|id| !id.trim().is_empty())?;
    Some((id, Some(access_token)))
}

// ---------------------------------------------------------------------------
// resolveTulearnSubject
// ---------------------------------------------------------------------------

async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    student_id: Option<&str>,
    access_token: Option<&str>,
) -> Result<TulearnSubject, SubjectError> {
    let normalized_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token)
            .await
            .map_err(|()| SubjectError::Internal)?;

    if !has_education_enabled(contact_data, outbound, &normalized_ws_id)
        .await
        .map_err(|()| SubjectError::Internal)?
    {
        return Err(SubjectError::Access(404, TULEARN_NOT_ENABLED_MESSAGE));
    }

    let self_student = resolve_self_student(contact_data, outbound, user_id, &normalized_ws_id)
        .await
        .map_err(|()| SubjectError::Internal)?;

    if student_id.is_none() {
        if let Some(workspace_user_id) = self_student {
            return Ok(TulearnSubject {
                ws_id: normalized_ws_id,
                student_platform_user_id: user_id.to_owned(),
                student_workspace_user_id: workspace_user_id,
            });
        }
    }

    // Parent path.
    let link = resolve_parent_link(
        contact_data,
        outbound,
        &normalized_ws_id,
        user_id,
        student_id,
    )
    .await
    .map_err(|()| SubjectError::Internal)?;

    let Some(link) = link else {
        return Err(SubjectError::Access(403, NO_LEARNER_ACCESS_MESSAGE));
    };

    let (Some(student_platform_user_id), Some(student_workspace_user_id)) = (
        link.student_platform_user_id,
        link.student_workspace_user_id,
    ) else {
        return Err(SubjectError::Access(403, NO_LEARNER_ACCESS_MESSAGE));
    };

    Ok(TulearnSubject {
        ws_id: normalized_ws_id,
        student_platform_user_id,
        student_workspace_user_id,
    })
}

async fn has_education_enabled(
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
    let rows = decode_rows::<WorkspaceSecretRow>(&response)?;

    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

/// Returns the workspace_user_id (virtual_user_id) when the platform user is a
/// linked learner in this workspace.
async fn resolve_self_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    platform_user_id: &str,
    ws_id: &str,
) -> Result<Option<String>, ()> {
    // workspace_user_linked_users joined to workspace_users!inner; we only need
    // virtual_user_id because the inner join guarantees the workspace_user
    // exists (PostgREST omits the row otherwise).
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
    let rows = decode_rows::<LinkedUserRow>(&response)?;

    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id)
        .filter(|id| !id.trim().is_empty()))
}

async fn resolve_parent_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    parent_user_id: &str,
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
    ];
    if let Some(student_id) = student_id {
        params.push(("student_workspace_user_id", format!("eq.{student_id}")));
    }
    params.push(("order", "created_at.asc".to_owned()));
    params.push(("limit", "1".to_owned()));

    let Some(url) = contact_data.rest_url("tulearn_parent_student_links", &params) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    let rows = decode_rows::<ParentLinkRow>(&response)?;

    Ok(rows.into_iter().next())
}

// ---------------------------------------------------------------------------
// getLearnerCourseDetail
// ---------------------------------------------------------------------------

async fn get_learner_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    subject: &TulearnSubject,
) -> Result<Option<CourseDetail>, ()> {
    let assigned_course_ids = get_assigned_course_ids(
        contact_data,
        outbound,
        &subject.student_workspace_user_id,
        &subject.ws_id,
    )
    .await?;

    if !assigned_course_ids.iter().any(|id| id == course_id) {
        return Ok(None);
    }

    let course = fetch_course(contact_data, outbound, course_id, &subject.ws_id).await?;
    let Some(course) = course else {
        return Ok(None);
    };

    let module_rows = fetch_course_modules(contact_data, outbound, course_id).await?;
    let module_id_list: Vec<String> = module_rows
        .iter()
        .filter_map(|module| module.id.clone())
        .collect();

    let completed_module_ids = if module_id_list.is_empty() {
        Vec::new()
    } else {
        fetch_completed_module_ids(
            contact_data,
            outbound,
            &subject.student_platform_user_id,
            &module_id_list,
        )
        .await?
    };

    let flashcard_counts = if module_id_list.is_empty() {
        Vec::new()
    } else {
        fetch_module_ids(
            contact_data,
            outbound,
            "course_module_flashcards",
            &module_id_list,
        )
        .await?
    };
    let quiz_counts = if module_id_list.is_empty() {
        Vec::new()
    } else {
        fetch_module_ids(
            contact_data,
            outbound,
            "course_module_quizzes",
            &module_id_list,
        )
        .await?
    };
    let quiz_set_counts = if module_id_list.is_empty() {
        Vec::new()
    } else {
        fetch_module_ids(
            contact_data,
            outbound,
            "course_module_quiz_sets",
            &module_id_list,
        )
        .await?
    };
    let test_rows = fetch_course_tests(contact_data, outbound, course_id).await?;

    let module_id_set: std::collections::HashSet<&str> =
        module_id_list.iter().map(String::as_str).collect();
    let completed_set: std::collections::HashSet<&str> =
        completed_module_ids.iter().map(String::as_str).collect();

    let flashcard_count_map = count_by_module(&flashcard_counts, &module_id_set);
    let quiz_count_map = count_by_module(&quiz_counts, &module_id_set);
    let quiz_set_count_map = count_by_module(&quiz_set_counts, &module_id_set);

    let mut prior_incomplete = false;
    let mut modules: Vec<CourseModuleSummary> = Vec::with_capacity(module_rows.len());
    for module in &module_rows {
        let Some(id) = module.id.clone() else {
            continue;
        };
        let is_published = module.is_published.unwrap_or(false);
        let completed = completed_set.contains(id.as_str());
        let locked = !is_published || prior_incomplete;
        if !completed && is_published {
            prior_incomplete = true;
        }

        modules.push(CourseModuleSummary {
            counts: CourseModuleCounts {
                flashcards: flashcard_count_map.get(id.as_str()).copied().unwrap_or(0),
                quizzes: quiz_count_map.get(id.as_str()).copied().unwrap_or(0),
                quiz_sets: quiz_set_count_map.get(id.as_str()).copied().unwrap_or(0),
            },
            completed,
            id,
            is_published,
            locked,
            name: module.name.clone(),
            sort_key: module.sort_key,
        });
    }

    let completed_modules = modules.iter().filter(|module| module.completed).count() as u64;
    let total_modules = modules.len() as u64;

    let tests: Vec<CourseTestSummary> = test_rows
        .into_iter()
        .filter_map(|test| {
            let id = test.id?;
            let module_ids = test
                .course_test_modules
                .into_iter()
                .filter_map(|row| row.module_id)
                .filter(|module_id| module_id_set.contains(module_id.as_str()))
                .collect();
            Some(CourseTestSummary {
                id,
                name: test.name,
                start_at: test.start_at,
                duration_in_minutes: test.duration_in_minutes,
                description: test.description,
                module_ids,
            })
        })
        .collect();

    let progress = if total_modules > 0 {
        round_percentage(completed_modules, total_modules)
    } else {
        0
    };

    Ok(Some(CourseDetail {
        id: course.id.unwrap_or_else(|| course_id.to_owned()),
        name: course.name,
        description: course.description,
        completed_modules,
        total_modules,
        progress,
        modules,
        tests,
    }))
}

async fn get_assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_workspace_user_id: &str,
    ws_id: &str,
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
    let response = service_role_get(contact_data, outbound, &url).await?;
    let rows = decode_rows::<AssignedGroupRow>(&response)?;

    Ok(rows.into_iter().filter_map(|row| row.group_id).collect())
}

async fn fetch_course(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    ws_id: &str,
) -> Result<Option<CourseRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name,description".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("eq.{course_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    let rows = decode_rows::<CourseRow>(&response)?;

    Ok(rows.into_iter().next())
}

async fn fetch_course_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
) -> Result<Vec<CourseModuleRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "id,name,sort_key,is_published".to_owned()),
            ("group_id", format!("eq.{course_id}")),
            ("is_published", "eq.true".to_owned()),
            ("order", "sort_key.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    decode_rows::<CourseModuleRow>(&response)
}

async fn fetch_completed_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_platform_user_id: &str,
    module_ids: &[String],
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "course_module_completion_status",
        &[
            ("select", "module_id".to_owned()),
            ("user_id", format!("eq.{student_platform_user_id}")),
            ("completion_status", "eq.true".to_owned()),
            ("module_id", in_filter(module_ids)),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    let rows = decode_rows::<ModuleIdRow>(&response)?;

    Ok(rows.into_iter().filter_map(|row| row.module_id).collect())
}

async fn fetch_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    module_ids: &[String],
) -> Result<Vec<String>, ()> {
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", "module_id".to_owned()),
            ("module_id", in_filter(module_ids)),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    let rows = decode_rows::<ModuleIdRow>(&response)?;

    Ok(rows.into_iter().filter_map(|row| row.module_id).collect())
}

async fn fetch_course_tests(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
) -> Result<Vec<CourseTestRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "course_tests",
        &[
            (
                "select",
                "id,name,start_at,duration_in_minutes,description,course_test_modules(module_id)"
                    .to_owned(),
            ),
            ("course_id", format!("eq.{course_id}")),
            ("is_published", "eq.true".to_owned()),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url).await?;
    decode_rows::<CourseTestRow>(&response)
}

// ---------------------------------------------------------------------------
// Workspace id normalization (mirrors normalizeWorkspaceId in packages/utils)
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

        if let Some(token) = access_token {
            if let Some(workspace_id) =
                workspace_id_by_handle(contact_data, outbound, &handle, token).await?
            {
                return Ok(workspace_id);
            }
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
    let rows = decode_rows::<WorkspaceIdRow>(&response)?;

    rows.into_iter().next().and_then(|row| row.id).ok_or(())
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

    Ok(response
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

fn decode_rows<T: for<'de> Deserialize<'de>>(response: &OutboundResponse) -> Result<Vec<T>, ()> {
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<T>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

fn count_by_module<'a>(
    rows: &'a [String],
    module_id_set: &std::collections::HashSet<&'a str>,
) -> std::collections::HashMap<&'a str, u64> {
    let mut map: std::collections::HashMap<&'a str, u64> = std::collections::HashMap::new();
    for module_id in rows {
        if let Some(key) = module_id_set.get(module_id.as_str()) {
            *map.entry(*key).or_insert(0) += 1;
        }
    }
    map
}

fn round_percentage(completed: u64, total: u64) -> i64 {
    if total == 0 {
        return 0;
    }
    // Math.round(x) rounds half away from zero for positive values; ratios here
    // are non-negative so floor(x + 0.5) matches.
    let ratio = (completed as f64) / (total as f64) * 100.0;
    (ratio + 0.5).floor() as i64
}

fn in_filter(values: &[String]) -> String {
    let joined = values
        .iter()
        .map(|value| value.as_str())
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|request_url| url::Url::parse(request_url).ok())?;
    url.query_pairs()
        .find(|(key, _)| key == "studentId")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty())
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

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------

/// Matches `/api/v1/workspaces/{wsId}/tulearn/courses/{courseId}` and returns
/// (ws_id, course_id). Both segments must be non-empty and contain no further
/// path separators.
fn tulearn_course_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(TULEARN_COURSES_PATH_PREFIX)?;
    let (ws_id, after) = rest.split_once(TULEARN_COURSES_PATH_INFIX)?;

    if ws_id.is_empty() || ws_id.contains('/') {
        return None;
    }
    if after.is_empty() || after.contains('/') {
        return None;
    }

    Some((ws_id, after))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
