//! Handler for `GET /api/v1/workspaces/:wsId/tulearn/practice`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/practice/route.ts`.
//!
//! The legacy GET path:
//!
//! - Authenticates the caller with `withSessionAuth({ allowAppSessionAuth: true })`.
//! - Resolves the "subject" learner via `resolveTulearnSubject` (workspace-id
//!   normalization, education-enabled guard, self-student vs parent-link lookup).
//! - Calls `getRecommendedPracticeItem` with the admin (service-role) client.
//! - Returns `{ item }` where `item` is the recommended practice item or `null`.
//!
//! The POST handler (submit practice result) is NOT ported here; `None` is
//! returned for all non-GET methods so the worker falls through to the live
//! Next.js route.
//!
//! Behavior gaps vs legacy:
//!
//! - App-session tokens are resolved identically to the home handler
//!   (`supabase_auth::request_access_token_allowing_app_sessions`).
//! - The `tulearnAccessErrorResponse` helper in the legacy TS maps thrown
//!   `TulearnAccessError` values to 403/404; this handler reproduces those
//!   status codes via the `TulearnError` enum.
//! - All Supabase reads that the legacy route performs with `createAdminClient()`
//!   are reproduced here using service-role headers (RLS bypassed), matching the
//!   legacy semantics.

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/tulearn/practice";

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_ERROR_MESSAGE: &str = "Failed to load practice";
const TULEARN_DISABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_tulearn_practice_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = practice_ws_id(request.path)?;

    Some(match request.method {
        "GET" => practice_get_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

fn practice_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

async fn practice_get_response(
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

    let student_id = student_id_from_url(request.url);

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
        Ok(subject) => subject,
        Err(TulearnError::Access { status, message }) => {
            return message_response(status, message);
        }
        Err(TulearnError::Internal) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let item = match get_recommended_practice_item(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_platform_user_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    no_store_response(json_response(200, json!({ "item": item })))
}

// ---------------------------------------------------------------------------
// Subject resolution (port of access.ts::resolveTulearnSubject).
// ---------------------------------------------------------------------------

enum TulearnError {
    Access { status: u16, message: &'static str },
    Internal,
}

struct TulearnSubject {
    ws_id: String,
    student_platform_user_id: String,
    student_workspace_user_id: String,
}

async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
    student_id: Option<&str>,
) -> Result<TulearnSubject, TulearnError> {
    let ws_id = normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token)
        .await
        .map_err(|()| TulearnError::Internal)?;

    if !has_education_enabled(contact_data, outbound, &ws_id)
        .await
        .map_err(|()| TulearnError::Internal)?
    {
        return Err(TulearnError::Access {
            status: 404,
            message: TULEARN_DISABLED_MESSAGE,
        });
    }

    let self_student = resolve_student_for_platform_user(contact_data, outbound, &ws_id, user_id)
        .await
        .map_err(|()| TulearnError::Internal)?;

    if student_id.is_none()
        && let Some(self_student) = self_student
    {
        return Ok(TulearnSubject {
            ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: self_student.workspace_user_id,
        });
    }

    let link = parent_student_link(contact_data, outbound, &ws_id, user_id, student_id)
        .await
        .map_err(|()| TulearnError::Internal)?;
    let Some(link) = link else {
        return Err(TulearnError::Access {
            status: 403,
            message: NO_LEARNER_ACCESS_MESSAGE,
        });
    };

    Ok(TulearnSubject {
        ws_id,
        student_platform_user_id: link.student_platform_user_id,
        student_workspace_user_id: link.student_workspace_user_id,
    })
}

struct SelfStudent {
    workspace_user_id: String,
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
}

async fn resolve_student_for_platform_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Option<SelfStudent>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "virtual_user_id".to_owned()),
            ("platform_user_id", format!("eq.{platform_user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LinkedUserRow> = response.json().map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        return Ok(None);
    };

    let Some(virtual_user_id) = row.virtual_user_id.filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };

    Ok(Some(SelfStudent {
        workspace_user_id: virtual_user_id,
    }))
}

struct ParentLink {
    student_platform_user_id: String,
    student_workspace_user_id: String,
}

#[derive(Deserialize)]
struct ParentLinkRow {
    student_platform_user_id: Option<String>,
    student_workspace_user_id: Option<String>,
}

async fn parent_student_link(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    parent_user_id: &str,
    student_id: Option<&str>,
) -> Result<Option<ParentLink>, ()> {
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<ParentLinkRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| {
        match (row.student_platform_user_id, row.student_workspace_user_id) {
            (Some(platform), Some(workspace)) => Some(ParentLink {
                student_platform_user_id: platform,
                student_workspace_user_id: workspace,
            }),
            _ => None,
        }
    }))
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    #[derive(Deserialize)]
    struct SecretRow {
        value: Option<String>,
    }
    let rows: Vec<SecretRow> = response.json().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .map(|value| value.trim().to_lowercase() == "true")
        .unwrap_or(false))
}

// ---------------------------------------------------------------------------
// Recommended practice (port of courses.ts::getRecommendedPracticeItem).
// ---------------------------------------------------------------------------

async fn get_recommended_practice_item(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;

    for course_id in &course_ids {
        let Some(detail) = get_course_detail_with_modules(
            contact_data,
            outbound,
            ws_id,
            student_platform_user_id,
            course_id,
        )
        .await?
        else {
            continue;
        };

        let chosen = detail
            .modules
            .iter()
            .find(|m| !m.completed && !m.locked)
            .or_else(|| detail.modules.iter().find(|m| !m.locked));

        if let Some(module) = chosen {
            let module_name =
                fetch_module_name(contact_data, outbound, course_id, &module.id).await?;
            return Ok(json!({
                "type": "module",
                "id": module.id,
                "title": module_name,
                "courseId": course_id,
                "courseName": detail.course_name,
                "prompt": detail.course_description,
            }));
        }
    }

    Ok(Value::Null)
}

// ---------------------------------------------------------------------------
// Assigned course ids (port of courses.ts::getAssignedCourseIds).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AssignedCourseRow {
    group_id: Option<String>,
}

async fn get_assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<String>, ()> {
    let select = "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,archived,is_guest,is_course_published)";
    let Some(url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", select.to_owned()),
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<AssignedCourseRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.group_id).collect())
}

// ---------------------------------------------------------------------------
// Course detail (minimal port of getLearnerCourseDetail for practice item
// selection: only published modules + completion status).
// ---------------------------------------------------------------------------

struct CourseDetail {
    course_name: Option<String>,
    course_description: Option<String>,
    modules: Vec<CourseModule>,
}

struct CourseModule {
    id: String,
    completed: bool,
    locked: bool,
}

#[derive(Deserialize)]
struct CourseRow {
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct ModuleRow {
    id: Option<String>,
    is_published: Option<bool>,
}

#[derive(Deserialize)]
struct ModuleIdRow {
    module_id: Option<String>,
}

async fn get_course_detail_with_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    course_id: &str,
) -> Result<Option<CourseDetail>, ()> {
    // Course metadata.
    let Some(course_url) = contact_data.rest_url(
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
    let course_resp = service_role_get(contact_data, outbound, &course_url, None).await?;
    if !(200..300).contains(&course_resp.status) {
        return Err(());
    }
    let course_rows: Vec<CourseRow> = course_resp.json().map_err(|_| ())?;
    let Some(course) = course_rows.into_iter().next() else {
        return Ok(None);
    };

    // Published modules ordered by sort_key.
    let Some(modules_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "id,is_published".to_owned()),
            ("group_id", format!("eq.{course_id}")),
            ("is_published", "eq.true".to_owned()),
            ("order", "sort_key.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let modules_resp = service_role_get(contact_data, outbound, &modules_url, None).await?;
    if !(200..300).contains(&modules_resp.status) {
        return Err(());
    }
    let module_rows: Vec<ModuleRow> = modules_resp.json().map_err(|_| ())?;

    let module_ids: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    // Completed module ids for the student.
    let completed_ids = fetch_completed_module_ids(
        contact_data,
        outbound,
        student_platform_user_id,
        &module_ids,
    )
    .await?;

    let mut prior_incomplete = false;
    let mut modules = Vec::with_capacity(module_rows.len());
    for module in module_rows {
        let Some(id) = module.id else { continue };
        let is_published = module.is_published.unwrap_or(false);
        let completed = completed_ids.contains(&id);
        let locked = !is_published || prior_incomplete;
        if !completed && is_published {
            prior_incomplete = true;
        }
        modules.push(CourseModule {
            id,
            completed,
            locked,
        });
    }

    Ok(Some(CourseDetail {
        course_name: course.name,
        course_description: course.description,
        modules,
    }))
}

async fn fetch_completed_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_platform_user_id: &str,
    module_ids: &[String],
) -> Result<std::collections::HashSet<String>, ()> {
    if module_ids.is_empty() {
        return Ok(std::collections::HashSet::new());
    }
    let Some(url) = contact_data.rest_url(
        "course_module_completion_status",
        &[
            ("select", "module_id".to_owned()),
            ("user_id", format!("eq.{student_platform_user_id}")),
            ("completion_status", "eq.true".to_owned()),
            ("module_id", format!("in.{}", in_list(module_ids))),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<ModuleIdRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.module_id).collect())
}

async fn fetch_module_name(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    module_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "name".to_owned()),
            ("id", format!("eq.{module_id}")),
            ("group_id", format!("eq.{course_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    #[derive(Deserialize)]
    struct NameRow {
        name: Option<String>,
    }
    let rows: Vec<NameRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| row.name))
}

// ---------------------------------------------------------------------------
// Workspace-id normalization (file-local; mirrors workspaces_tulearn_home.rs).
// ---------------------------------------------------------------------------

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let resolved = resolve_workspace_id(raw_ws_id);

    if resolved == ROOT_WORKSPACE_ID {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if raw_ws_id
        .trim()
        .eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG)
    {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if !is_workspace_uuid_literal(&resolved) {
        let handle = raw_ws_id.trim().to_lowercase();
        if is_direct_workspace_lookup_identifier(&handle) {
            if let Some(id) =
                workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
            {
                return Ok(id);
            }
            if let Some(id) =
                workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
            {
                return Ok(id);
            }
        }
    }

    Ok(resolved)
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
            .all(|(index, ch)| match index {
                8 | 13 | 18 | 23 => ch == '-',
                _ => ch.is_ascii_hexdigit(),
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

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
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
    let response = caller_get(contact_data, outbound, &url, access_token).await?;
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
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
// REST helpers
// ---------------------------------------------------------------------------

async fn service_role_get(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    url: &str,
    schema: Option<&str>,
) -> Result<OutboundResponse, ()> {
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");

    let mut req = OutboundRequest::new(OutboundMethod::Get, url)
        .with_header("Accept", APPLICATION_JSON)
        .with_header("Authorization", &authorization)
        .with_header("apikey", service_role_key);
    if let Some(schema) = schema {
        req = req.with_header("Accept-Profile", schema);
    }

    outbound.send(req).await.map_err(|_| ())
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok())?;
    url.query_pairs().find_map(|(key, value)| {
        (key == "studentId" && !value.trim().is_empty()).then(|| value.into_owned())
    })
}

fn in_list(ids: &[String]) -> String {
    let inner = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "")))
        .collect::<Vec<_>>()
        .join(",");
    format!("({inner})")
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_guard_matches_valid_paths() {
        assert_eq!(
            practice_ws_id("/api/v1/workspaces/abc-123/tulearn/practice"),
            Some("abc-123")
        );
        assert_eq!(
            practice_ws_id(
                "/api/v1/workspaces/00000000-0000-0000-0000-000000000000/tulearn/practice"
            ),
            Some("00000000-0000-0000-0000-000000000000")
        );
    }

    #[test]
    fn path_guard_rejects_mismatched_paths() {
        assert_eq!(practice_ws_id("/api/v1/workspaces/abc/tulearn/home"), None);
        assert_eq!(practice_ws_id("/api/v1/workspaces//tulearn/practice"), None);
        assert_eq!(
            practice_ws_id("/api/v1/workspaces/a/b/tulearn/practice"),
            None
        );
        assert_eq!(practice_ws_id("/api/v1/workspaces/tulearn/practice"), None);
    }

    #[test]
    fn in_list_formats_correctly() {
        let ids = vec!["id-1".to_owned(), "id-2".to_owned()];
        assert_eq!(in_list(&ids), r#"("id-1","id-2")"#);
    }

    #[test]
    fn in_list_empty() {
        assert_eq!(in_list(&[]), "()");
    }

    #[test]
    fn workspace_uuid_literal_detection() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(!is_workspace_uuid_literal("not-a-uuid"));
        assert!(!is_workspace_uuid_literal("short"));
    }

    #[test]
    fn workspace_handle_detection() {
        assert!(is_workspace_handle("my-workspace"));
        assert!(is_workspace_handle("abc123"));
        assert!(!is_workspace_handle("-starts-with-dash"));
        assert!(!is_workspace_handle("ends-with-dash-"));
        assert!(!is_workspace_handle(""));
    }

    #[test]
    fn resolve_workspace_id_internal_slug() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("other"), "other");
    }
}
