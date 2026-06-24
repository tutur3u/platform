//! Handler for `/api/v1/course`.
//!
//! Ported from the legacy Next.js route at
//! `apps/web/src/app/api/v1/course/route.ts`. This is a STATIC path matched by
//! exact `(method, path)` equality. It supports a single `GET` method with two
//! mutually exclusive modes selected by query params:
//!
//!   * `?courseId=<uuid>[&studentId=<uuid>]` -> detailed content for one course
//!   * `?wsId=<workspace>[&studentId=<uuid>]` -> list of courses for a workspace
//!
//! All `sbAdmin` (service-role / `createAdminClient`) reads in the legacy route
//! are reproduced here via service-role REST requests. The two
//! `sessionSupabase` (RLS) reads in the guest-permission fallback are reproduced
//! via caller-token REST requests so RLS still applies, exactly like the legacy
//! behavior.
//!
//! This module is fully self-contained: every helper it needs is defined as a
//! file-local fn. No shared helpers were added to other modules.

use serde::Deserialize;
use serde_json::{Map, Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const COURSE_PATH: &str = "/api/v1/course";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal Server Error";

// ─── Entry point ─────────────────────────────────────────────────────────────

pub(crate) async fn handle_course_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != COURSE_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => course_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn course_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the caller. The legacy route allows app-session auth via
    // `resolveSessionAuthContext({ allowAppSessionAuth: true })`; here we use the
    // standard supabase access-token path (bearer or supabase auth cookie). See
    // module/integration notes: app-session-only callers are not supported by
    // this port.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let course_id = query_param(request.url, "courseId");
    let ws_id = query_param(request.url, "wsId");
    let student_id = query_param(request.url, "studentId");

    if let Some(course_id) = course_id.as_deref() {
        return handle_course_detail(
            contact_data,
            outbound,
            course_id,
            student_id.as_deref(),
            &user_id,
            &access_token,
        )
        .await;
    }

    if let Some(ws_id) = ws_id.as_deref() {
        return handle_course_list(
            contact_data,
            outbound,
            ws_id,
            student_id.as_deref(),
            &user_id,
            &access_token,
        )
        .await;
    }

    error_message_response(400, "Provide either courseId or wsId query param")
}

// ─── List all courses for a workspace ────────────────────────────────────────

async fn handle_course_list(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_id: Option<&str>,
    user_id: &str,
    access_token: &str,
) -> BackendResponse {
    // ListQuerySchema: wsId.min(1), studentId.optional().guid()
    if ws_id.is_empty() {
        return invalid_param_response("Invalid wsId");
    }
    if let Some(student_id) = student_id
        && !is_uuid_literal(student_id)
    {
        return invalid_param_response("Invalid wsId");
    }

    let subject = match resolve_tulearn_subject(
        contact_data,
        outbound,
        ws_id,
        student_id,
        user_id,
        access_token,
    )
    .await
    {
        Ok(subject) => subject,
        Err(SubjectError::Access { status, message }) => {
            return tulearn_access_response(status, &message);
        }
        Err(SubjectError::Internal) => {
            return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
        }
    };

    match get_learner_course_summaries(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_platform_user_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(courses) => no_store_response(json_response(200, json!({ "courses": courses }))),
        Err(()) => error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ─── Course detail ───────────────────────────────────────────────────────────

async fn handle_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    student_id: Option<&str>,
    user_id: &str,
    access_token: &str,
) -> BackendResponse {
    // DetailQuerySchema: courseId.guid(), studentId.optional().guid()
    if !is_uuid_literal(course_id) {
        return invalid_param_response("Invalid courseId");
    }
    if let Some(student_id) = student_id
        && !is_uuid_literal(student_id)
    {
        return invalid_param_response("Invalid courseId");
    }

    let group_id = course_id;

    // Fetch the published course group (service role).
    let group = match fetch_course_group(contact_data, outbound, group_id).await {
        Ok(Some(group)) => group,
        Ok(None) => return error_message_response(404, "Course not found"),
        Err(()) => {
            return error_message_response_with_code(
                500,
                "Failed to load course content",
                "course_group_lookup_failed",
            );
        }
    };
    let ws_id = group.ws_id;

    let mut has_access = false;
    let mut learner_modules: Vec<LearnerModuleSummary> = Vec::new();

    // 1) Explicit studentId -> resolve subject + learner detail.
    if let Some(student_id) = student_id {
        let subject = match resolve_tulearn_subject(
            contact_data,
            outbound,
            &ws_id,
            Some(student_id),
            user_id,
            access_token,
        )
        .await
        {
            Ok(subject) => subject,
            Err(SubjectError::Access { status, message }) => {
                return tulearn_access_response(status, &message);
            }
            Err(SubjectError::Internal) => {
                return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE);
            }
        };

        match get_learner_course_detail(
            contact_data,
            outbound,
            group_id,
            &subject.ws_id,
            &subject.student_platform_user_id,
            &subject.student_workspace_user_id,
        )
        .await
        {
            Ok(Some(detail)) => {
                learner_modules = detail.modules;
                has_access = true;
            }
            Ok(None) => return error_message_response(404, "Course not found"),
            Err(()) => return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }

    // 2) Self student (the platform user is a learner in this workspace).
    if !has_access {
        match resolve_student_for_platform_user(contact_data, outbound, user_id, &ws_id).await {
            Ok(Some(self_student)) => {
                match get_learner_course_detail(
                    contact_data,
                    outbound,
                    group_id,
                    &ws_id,
                    user_id,
                    &self_student.workspace_user_id,
                )
                .await
                {
                    Ok(Some(detail)) => {
                        learner_modules = detail.modules;
                        has_access = true;
                    }
                    Ok(None) => return error_message_response(404, "Course not found"),
                    Err(()) => return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
                }
            }
            Ok(None) => {}
            Err(()) => return error_message_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
        }
    }

    // 3) Guest course permission fallback (caller session / RLS).
    if !has_access {
        match guest_has_course_access(
            contact_data,
            outbound,
            &ws_id,
            user_id,
            group_id,
            access_token,
        )
        .await
        {
            Ok(granted) => has_access = granted,
            Err(GuestError::Code(code)) => {
                return error_message_response_with_code(
                    500,
                    "Failed to load course content",
                    code,
                );
            }
        }
    }

    if !has_access {
        return error_message_response(403, "Forbidden");
    }

    // Fetch published modules (service role).
    let published_modules = match fetch_published_modules(contact_data, outbound, group_id).await {
        Ok(modules) => modules,
        Err(()) => {
            return error_message_response_with_code(
                500,
                "Failed to load course content",
                "course_modules_lookup_failed",
            );
        }
    };

    let module_ids: Vec<String> = published_modules
        .iter()
        .filter_map(|m| m.get("id").and_then(Value::as_str).map(str::to_owned))
        .collect();

    // Fetch quiz/flashcard/quiz-set counts (service role).
    let (quiz_count, flashcard_count, quiz_set_count) = if module_ids.is_empty() {
        (
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
        )
    } else {
        let quizzes =
            match fetch_module_counts(contact_data, outbound, "course_module_quizzes", &module_ids)
                .await
            {
                Ok(counts) => counts,
                Err(()) => {
                    return error_message_response_with_code(
                        500,
                        "Failed to load course content",
                        "course_quizzes_lookup_failed",
                    );
                }
            };
        let flashcards = match fetch_module_counts(
            contact_data,
            outbound,
            "course_module_flashcards",
            &module_ids,
        )
        .await
        {
            Ok(counts) => counts,
            Err(()) => {
                return error_message_response_with_code(
                    500,
                    "Failed to load course content",
                    "course_flashcards_lookup_failed",
                );
            }
        };
        let quiz_sets = match fetch_module_counts(
            contact_data,
            outbound,
            "course_module_quiz_sets",
            &module_ids,
        )
        .await
        {
            Ok(counts) => counts,
            Err(()) => {
                return error_message_response_with_code(
                    500,
                    "Failed to load course content",
                    "course_quiz_sets_lookup_failed",
                );
            }
        };
        (quizzes, flashcards, quiz_sets)
    };

    // Map of learner module access by module id.
    let learner_by_id: std::collections::HashMap<String, LearnerModuleSummary> = learner_modules
        .into_iter()
        .map(|m| (m.id.clone(), m))
        .collect();

    let modules: Vec<Value> = published_modules
        .into_iter()
        .map(|module| {
            let module_id = module
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            let learner = learner_by_id.get(&module_id);
            let locked_flag = learner.map(|m| m.locked).unwrap_or(false);

            // Start from the full module object (spread `...module`).
            let mut out: Map<String, Value> = match module {
                Value::Object(map) => map,
                _ => Map::new(),
            };

            // completed: learnerModule?.completed (undefined => omitted in JSON).
            match learner {
                Some(m) => {
                    out.insert("completed".to_owned(), Value::Bool(m.completed));
                }
                None => {
                    out.remove("completed");
                }
            }

            // content: locked ? null : toRichTextContent(module.content)
            let content_value = out.remove("content").unwrap_or(Value::Null);
            out.insert(
                "content".to_owned(),
                if locked_flag {
                    Value::Null
                } else {
                    to_rich_text_content(content_value)
                },
            );

            // extra_content: locked ? null : module.extra_content
            if locked_flag {
                out.insert("extra_content".to_owned(), Value::Null);
            }

            // flashcards / quizzes / quizSets counts.
            let flashcards = learner
                .map(|m| m.counts_flashcards)
                .unwrap_or_else(|| flashcard_count.get(&module_id).copied().unwrap_or(0));
            let quizzes = learner
                .map(|m| m.counts_quizzes)
                .unwrap_or_else(|| quiz_count.get(&module_id).copied().unwrap_or(0));
            let quiz_sets = learner
                .map(|m| m.counts_quiz_sets)
                .unwrap_or_else(|| quiz_set_count.get(&module_id).copied().unwrap_or(0));
            out.insert("flashcards".to_owned(), json!(flashcards));
            out.insert("quizzes".to_owned(), json!(quizzes));
            out.insert("quizSets".to_owned(), json!(quiz_sets));

            // locked: learnerModule?.locked (undefined => omitted)
            match learner {
                Some(m) => {
                    out.insert("locked".to_owned(), Value::Bool(m.locked));
                }
                None => {
                    out.remove("locked");
                }
            }

            // youtube_links: locked ? null : module.youtube_links
            if locked_flag {
                out.insert("youtube_links".to_owned(), Value::Null);
            }

            Value::Object(out)
        })
        .collect();

    no_store_response(json_response(
        200,
        json!({
            "group": {
                "description": group.description,
                "name": group.name,
            },
            "modules": modules,
        }),
    ))
}

// ─── Tulearn subject resolution (port of resolveTulearnSubject) ───────────────

struct TulearnSubject {
    ws_id: String,
    student_platform_user_id: String,
    student_workspace_user_id: String,
}

enum SubjectError {
    /// TulearnAccessError: 403 or 404 with `{ message }`.
    Access {
        status: u16,
        message: String,
    },
    Internal,
}

#[derive(Deserialize)]
struct LinkedUserWorkspaceUser {
    id: Option<String>,
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
    workspace_users: Option<LinkedUserWorkspaceUser>,
}

struct SelfStudent {
    workspace_user_id: String,
}

#[derive(Deserialize)]
struct ParentLinkRow {
    student_platform_user_id: Option<String>,
    student_workspace_user_id: Option<String>,
}

async fn resolve_tulearn_subject(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    student_id: Option<&str>,
    user_id: &str,
    access_token: &str,
) -> Result<TulearnSubject, SubjectError> {
    let normalized_ws_id =
        normalize_workspace_id(contact_data, outbound, raw_ws_id, user_id, access_token)
            .await
            .map_err(|_| SubjectError::Internal)?;

    match education_enabled(contact_data, outbound, &normalized_ws_id).await {
        Ok(true) => {}
        Ok(false) => {
            return Err(SubjectError::Access {
                status: 404,
                message: "Tulearn is not enabled for this workspace".to_owned(),
            });
        }
        Err(()) => return Err(SubjectError::Internal),
    }

    let self_student =
        resolve_student_for_platform_user(contact_data, outbound, user_id, &normalized_ws_id)
            .await
            .map_err(|_| SubjectError::Internal)?;

    if student_id.is_none()
        && let Some(self_student) = &self_student
    {
        return Ok(TulearnSubject {
            ws_id: normalized_ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: self_student.workspace_user_id.clone(),
        });
    }

    // Parent link lookup.
    let link = fetch_parent_student_link(
        contact_data,
        outbound,
        &normalized_ws_id,
        user_id,
        student_id,
    )
    .await
    .map_err(|_| SubjectError::Internal)?;

    let Some(link) = link else {
        return Err(SubjectError::Access {
            status: 403,
            message: "You don't have access to this learner".to_owned(),
        });
    };

    let (Some(student_platform_user_id), Some(student_workspace_user_id)) = (
        link.student_platform_user_id,
        link.student_workspace_user_id,
    ) else {
        return Err(SubjectError::Access {
            status: 403,
            message: "You don't have access to this learner".to_owned(),
        });
    };

    Ok(TulearnSubject {
        ws_id: normalized_ws_id,
        student_platform_user_id,
        student_workspace_user_id,
    })
}

async fn fetch_parent_student_link(
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
        ("order", "created_at.asc".to_owned()),
        ("limit", "1".to_owned()),
    ];
    if let Some(student_id) = student_id {
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

async fn resolve_student_for_platform_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    platform_user_id: &str,
    ws_id: &str,
) -> Result<Option<SelfStudent>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_linked_users",
            &[
                (
                    "select",
                    "virtual_user_id,workspace_users!inner(id,full_name,display_name,email,avatar_url,ws_id)"
                        .to_owned(),
                ),
                ("platform_user_id", format!("eq.{platform_user_id}")),
                ("ws_id", format!("eq.{ws_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let Some(row) = response
        .json::<Vec<LinkedUserRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };

    let has_workspace_user = row
        .workspace_users
        .as_ref()
        .and_then(|wu| wu.id.as_ref())
        .is_some();

    match (row.virtual_user_id, has_workspace_user) {
        (Some(virtual_user_id), true) => Ok(Some(SelfStudent {
            workspace_user_id: virtual_user_id,
        })),
        _ => Ok(None),
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

    #[derive(Deserialize)]
    struct SecretRow {
        value: Option<String>,
    }

    Ok(response
        .json::<Vec<SecretRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.value)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("true")))
}

// ─── Learner course summaries (port of getLearnerCourseSummaries) ────────────

async fn get_learner_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<Value>, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Vec::new());
    }

    let in_filter = format!("in.({})", course_ids.join(","));

    // courses (id, name, description) ordered by name asc, filtered by ws_id + in(ids)
    let courses = {
        let url = contact_data
            .rest_url(
                "workspace_user_groups",
                &[
                    ("select", "id,name,description".to_owned()),
                    ("ws_id", format!("eq.{ws_id}")),
                    ("id", in_filter.clone()),
                    ("order", "name.asc".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        response
            .json::<Vec<CourseGroupSummaryRow>>()
            .map_err(|_| ())?
    };

    // published modules (id, group_id) for these courses
    let modules = {
        let url = contact_data
            .rest_url(
                "workspace_course_modules",
                &[
                    ("select", "id,group_id".to_owned()),
                    ("group_id", in_filter.clone()),
                    ("is_published", "eq.true".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        response.json::<Vec<ModuleGroupRow>>().map_err(|_| ())?
    };

    // completed module ids for this learner
    let completed =
        fetch_completed_module_ids(contact_data, outbound, student_platform_user_id, None).await?;

    let mut modules_by_course: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for module in modules {
        let (Some(id), Some(group_id)) = (module.id, module.group_id) else {
            continue;
        };
        modules_by_course.entry(group_id).or_default().push(id);
    }

    let summaries = courses
        .into_iter()
        .map(|course| {
            let id = course.id.unwrap_or_default();
            let module_ids = modules_by_course.get(&id).cloned().unwrap_or_default();
            let total = module_ids.len();
            let completed_count = module_ids
                .iter()
                .filter(|module_id| completed.contains(*module_id))
                .count();
            let progress = if total > 0 {
                round_percent(completed_count, total)
            } else {
                0
            };
            json!({
                "id": id,
                "name": course.name,
                "description": course.description,
                "completedModules": completed_count,
                "totalModules": total,
                "progress": progress,
            })
        })
        .collect();

    Ok(summaries)
}

// ─── Learner course detail (port of getLearnerCourseDetail) ──────────────────

struct LearnerModuleSummary {
    id: String,
    completed: bool,
    locked: bool,
    counts_flashcards: u64,
    counts_quizzes: u64,
    counts_quiz_sets: u64,
}

struct LearnerCourseDetail {
    modules: Vec<LearnerModuleSummary>,
}

#[derive(Deserialize)]
struct CourseGroupSummaryRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct ModuleGroupRow {
    id: Option<String>,
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct DetailModuleRow {
    id: Option<String>,
    is_published: Option<bool>,
}

async fn get_learner_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    course_id: &str,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Option<LearnerCourseDetail>, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if !course_ids.iter().any(|id| id == course_id) {
        return Ok(None);
    }

    // course existence check (maybeSingle).
    {
        let url = contact_data
            .rest_url(
                "workspace_user_groups",
                &[
                    ("select", "id,name,description".to_owned()),
                    ("ws_id", format!("eq.{ws_id}")),
                    ("id", format!("eq.{course_id}")),
                    ("limit", "1".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        let exists = response
            .json::<Vec<CourseGroupSummaryRow>>()
            .map_err(|_| ())?
            .into_iter()
            .next()
            .is_some();
        if !exists {
            return Ok(None);
        }
    }

    // published modules (id, is_published) ordered by sort_key asc.
    let module_rows = {
        let url = contact_data
            .rest_url(
                "workspace_course_modules",
                &[
                    ("select", "id,name,sort_key,is_published".to_owned()),
                    ("group_id", format!("eq.{course_id}")),
                    ("is_published", "eq.true".to_owned()),
                    ("order", "sort_key.asc".to_owned()),
                ],
            )
            .ok_or(())?;
        let response = send_service_role_request(contact_data, outbound, &url).await?;
        if !(200..300).contains(&response.status) {
            return Err(());
        }
        response.json::<Vec<DetailModuleRow>>().map_err(|_| ())?
    };

    let module_id_list: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    let (completed, flashcards, quizzes, quiz_sets) = if module_id_list.is_empty() {
        (
            std::collections::HashSet::new(),
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
            std::collections::HashMap::new(),
        )
    } else {
        let completed = fetch_completed_module_ids(
            contact_data,
            outbound,
            student_platform_user_id,
            Some(&module_id_list),
        )
        .await?;
        let flashcards = fetch_module_counts(
            contact_data,
            outbound,
            "course_module_flashcards",
            &module_id_list,
        )
        .await?;
        let quizzes = fetch_module_counts(
            contact_data,
            outbound,
            "course_module_quizzes",
            &module_id_list,
        )
        .await?;
        let quiz_sets = fetch_module_counts(
            contact_data,
            outbound,
            "course_module_quiz_sets",
            &module_id_list,
        )
        .await?;
        (completed, flashcards, quizzes, quiz_sets)
    };

    let module_id_set: std::collections::HashSet<&String> = module_id_list.iter().collect();

    let mut prior_incomplete = false;
    let modules = module_rows
        .into_iter()
        .filter_map(|module| {
            let id = module.id?;
            let is_published = module.is_published.unwrap_or(false);
            let completed_flag = completed.contains(&id);
            let locked = !is_published || prior_incomplete;
            if !completed_flag && is_published {
                prior_incomplete = true;
            }
            // counts only counted for module ids present in the set (mirrors
            // countByModule which checks moduleIds.has(row.module_id)). All ids
            // here are in the set by construction.
            let _ = &module_id_set;
            Some(LearnerModuleSummary {
                counts_flashcards: flashcards.get(&id).copied().unwrap_or(0),
                counts_quizzes: quizzes.get(&id).copied().unwrap_or(0),
                counts_quiz_sets: quiz_sets.get(&id).copied().unwrap_or(0),
                id,
                completed: completed_flag,
                locked,
            })
        })
        .collect();

    Ok(Some(LearnerCourseDetail { modules }))
}

// ─── Assigned course ids (port of getAssignedCourseIds) ──────────────────────

async fn get_assigned_course_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Vec<String>, ()> {
    let url = contact_data
        .rest_url(
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
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    #[derive(Deserialize)]
    struct GroupIdRow {
        group_id: Option<String>,
    }

    Ok(response
        .json::<Vec<GroupIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.group_id)
        .collect())
}

// ─── Shared service-role REST reads ──────────────────────────────────────────

#[derive(Deserialize)]
struct ModuleIdRow {
    module_id: Option<String>,
}

/// Returns set of completed module ids for the learner. When `module_ids` is
/// provided, restricts the lookup with `in.(...)`.
async fn fetch_completed_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_platform_user_id: &str,
    module_ids: Option<&[String]>,
) -> Result<std::collections::HashSet<String>, ()> {
    let mut params = vec![
        ("select", "module_id".to_owned()),
        ("user_id", format!("eq.{student_platform_user_id}")),
        ("completion_status", "eq.true".to_owned()),
    ];
    if let Some(module_ids) = module_ids {
        params.push(("module_id", format!("in.({})", module_ids.join(","))));
    }

    let url = contact_data
        .rest_url("course_module_completion_status", &params)
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<ModuleIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .filter_map(|row| row.module_id)
        .collect())
}

/// Counts rows per module id for a `course_module_*` join table restricted to
/// the given module ids. Mirrors the `.in('module_id', moduleIds)` + map count.
async fn fetch_module_counts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    module_ids: &[String],
) -> Result<std::collections::HashMap<String, u64>, ()> {
    if module_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let url = contact_data
        .rest_url(
            table,
            &[
                ("select", "module_id".to_owned()),
                ("module_id", format!("in.({})", module_ids.join(","))),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let id_set: std::collections::HashSet<&String> = module_ids.iter().collect();
    let mut counts: std::collections::HashMap<String, u64> = std::collections::HashMap::new();
    for row in response.json::<Vec<ModuleIdRow>>().map_err(|_| ())? {
        if let Some(module_id) = row.module_id
            && id_set.contains(&module_id)
        {
            *counts.entry(module_id).or_insert(0) += 1;
        }
    }
    Ok(counts)
}

struct CourseGroup {
    ws_id: String,
    name: Value,
    description: Value,
}

async fn fetch_course_group(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Option<CourseGroup>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_user_groups",
            &[
                ("select", "id,ws_id,name,description".to_owned()),
                ("id", format!("eq.{group_id}")),
                ("is_course_published", "eq.true".to_owned()),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let Some(row) = response
        .json::<Vec<Value>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
    else {
        return Ok(None);
    };

    let ws_id = row
        .get("ws_id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(())?;

    Ok(Some(CourseGroup {
        ws_id,
        name: row.get("name").cloned().unwrap_or(Value::Null),
        description: row.get("description").cloned().unwrap_or(Value::Null),
    }))
}

async fn fetch_published_modules(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    group_id: &str,
) -> Result<Vec<Value>, ()> {
    let url = contact_data
        .rest_url(
            "workspace_course_modules",
            &[
                (
                    "select",
                    "id,name,content,extra_content,youtube_links,group_id,module_group_id,created_at,is_public,is_published,sort_key"
                        .to_owned(),
                ),
                ("group_id", format!("eq.{group_id}")),
                ("is_published", "eq.true".to_owned()),
                // Match legacy ordering: sort_key asc nullsLast, then created_at asc.
                ("order", "sort_key.asc.nullslast".to_owned()),
                ("order", "created_at.asc".to_owned()),
            ],
        )
        .ok_or(())?;
    let response = send_service_role_request(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<Value>>().map_err(|_| ())
}

// ─── Guest course permission fallback (caller session / RLS) ─────────────────

enum GuestError {
    /// Throws a CourseRouteError with this code -> 500 `{ code, error }`.
    Code(&'static str),
}

async fn guest_has_course_access(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    group_id: &str,
    access_token: &str,
) -> Result<bool, GuestError> {
    // 1) Lookup the workspace guest row for this user (caller session / RLS).
    let guest_url = contact_data
        .rest_url(
            "workspace_guests",
            &[
                ("select", "id".to_owned()),
                ("ws_id", format!("eq.{ws_id}")),
                ("user_id", format!("eq.{user_id}")),
                ("limit", "1".to_owned()),
            ],
        )
        .ok_or(GuestError::Code("workspace_guest_lookup_failed"))?;
    let response = send_caller_request(contact_data, outbound, &guest_url, access_token)
        .await
        .map_err(|_| GuestError::Code("workspace_guest_lookup_failed"))?;
    if !(200..300).contains(&response.status) {
        return Err(GuestError::Code("workspace_guest_lookup_failed"));
    }

    #[derive(Deserialize)]
    struct GuestRow {
        id: Option<String>,
    }

    let Some(guest_id) = response
        .json::<Vec<GuestRow>>()
        .map_err(|_| GuestError::Code("workspace_guest_lookup_failed"))?
        .into_iter()
        .next()
        .and_then(|row| row.id)
    else {
        return Ok(false);
    };

    // 2) Lookup matching guest permissions (caller session / RLS).
    // .or(`resource_id.is.null,resource_id.eq.${groupId}`)
    let or_filter = format!("(resource_id.is.null,resource_id.eq.{group_id})");
    let perm_url = contact_data
        .rest_url(
            "workspace_guest_permissions",
            &[
                ("select", "enable,resource_id".to_owned()),
                ("guest_id", format!("eq.{guest_id}")),
                ("permission", "eq.course:view".to_owned()),
                ("or", or_filter),
            ],
        )
        .ok_or(GuestError::Code("workspace_guest_permission_lookup_failed"))?;
    let response = send_caller_request(contact_data, outbound, &perm_url, access_token)
        .await
        .map_err(|_| GuestError::Code("workspace_guest_permission_lookup_failed"))?;
    if !(200..300).contains(&response.status) {
        return Err(GuestError::Code("workspace_guest_permission_lookup_failed"));
    }

    #[derive(Deserialize)]
    struct PermissionRow {
        enable: Option<bool>,
    }

    Ok(response
        .json::<Vec<PermissionRow>>()
        .map_err(|_| GuestError::Code("workspace_guest_permission_lookup_failed"))?
        .into_iter()
        .any(|row| row.enable.unwrap_or(false)))
}

// ─── Workspace id normalization (port of normalizeWorkspaceId) ───────────────

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

async fn normalize_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    raw_ws_id: &str,
    user_id: &str,
    access_token: &str,
) -> Result<String, ()> {
    let trimmed = raw_ws_id.trim();

    if trimmed.eq_ignore_ascii_case(INTERNAL_WORKSPACE_SLUG) {
        return Ok(ROOT_WORKSPACE_ID.to_owned());
    }

    if trimmed.eq_ignore_ascii_case(PERSONAL_WORKSPACE_SLUG) {
        return personal_workspace_id(contact_data, outbound, user_id, access_token).await;
    }

    if is_uuid_literal(trimmed) {
        return Ok(trimmed.to_owned());
    }

    // Treat as a workspace handle; resolve to its id. Falls back to the raw
    // identifier when no handle match is found.
    let handle = trimmed.to_lowercase();
    if let Some(workspace_id) = workspace_id_by_handle(contact_data, outbound, &handle).await? {
        return Ok(workspace_id);
    }

    Ok(trimmed.to_owned())
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
    let response = send_caller_request(contact_data, outbound, &url, access_token).await?;
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

// ─── REST request helpers ────────────────────────────────────────────────────

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

async fn send_caller_request(
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

// ─── Pure helpers ────────────────────────────────────────────────────────────

/// Mirrors toRichTextContent: returns the value only when it is a `{ type: "doc" }`
/// object (with `content` being an array when present), otherwise `null`.
fn to_rich_text_content(value: Value) -> Value {
    let Value::Object(ref map) = value else {
        return Value::Null;
    };
    let is_doc = map.get("type").and_then(Value::as_str) == Some("doc");
    if !is_doc {
        return Value::Null;
    }
    if let Some(content) = map.get("content")
        && !content.is_array()
    {
        return Value::Null;
    }
    value
}

fn round_percent(numerator: usize, denominator: usize) -> u64 {
    if denominator == 0 {
        return 0;
    }
    // Math.round((completed / total) * 100)
    let value = (numerator as f64 / denominator as f64) * 100.0;
    value.round() as u64
}

fn is_uuid_literal(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.len() == 36
        && trimmed.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

/// Extracts a query parameter value from the request URL, decoding it. Returns
/// `None` when absent or empty.
fn query_param(url: Option<&str>, key: &str) -> Option<String> {
    let url = url?;
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        if k == key {
            let decoded = url::form_urlencoded::parse(format!("{k}={v}").as_bytes())
                .next()
                .map(|(_, value)| value.into_owned())
                .unwrap_or_default();
            if decoded.is_empty() {
                return None;
            }
            return Some(decoded);
        }
    }
    None
}

// ─── Response builders ───────────────────────────────────────────────────────

fn error_message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}

fn error_message_response_with_code(status: u16, message: &str, code: &str) -> BackendResponse {
    no_store_response(json_response(
        status,
        json!({ "code": code, "error": message }),
    ))
}

/// Mirrors the 400 zod-validation responses. The legacy includes `errors`
/// (the zod issues array); we emit an empty array to keep the shape `{ error, errors }`.
fn invalid_param_response(message: &str) -> BackendResponse {
    no_store_response(json_response(
        400,
        json!({ "error": message, "errors": Value::Array(Vec::new()) }),
    ))
}

/// Mirrors tulearnAccessErrorResponse: `{ message }` with 403/404.
fn tulearn_access_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
