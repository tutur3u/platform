//! Handler for `GET /api/v1/workspaces/:wsId/tulearn/courses/:courseId/modules/:moduleId`.
//!
//! Ports the GET method from the legacy Next.js route at
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/courses/[courseId]/modules/[moduleId]/route.ts`.
//! POST and DELETE are NOT migrated; `None` is returned for those methods so the
//! worker falls through to the still-live Next.js route.
//!
//! ## Behavior
//!
//! 1. Authenticates via `supabase_auth::request_access_token_allowing_app_sessions` (the
//!    legacy route uses `withSessionAuth` with `allowAppSessionAuth: true`).
//! 2. Resolves the Tulearn "subject" (student identity), mirroring
//!    `resolveTulearnSubject` from `@/lib/tulearn/service`.
//! 3. Checks the course is assigned to the student, fetches published modules
//!    with their locked/completed state (`getLearnerCourseDetail`), and verifies
//!    the requested module is present and not locked.
//! 4. Fetches module content, flashcards, quizzes (sanitized — no `answer`
//!    field; `matching` content is replaced with choices/left-prompts), quiz sets,
//!    and quiz submissions for the student, then returns them as a single JSON
//!    envelope.
//!
//! ## Behavior gaps vs legacy
//!
//! - **App-session path**: uses `request_access_token_allowing_app_sessions` which
//!   covers Supabase bearer/cookie sessions. The full CLI-token app-session branch
//!   (`contact::resolve_app_session_identity`) is not reproduced here because
//!   `BackendRequest` does not surface the raw `Authorization: App …` header.
//! - **`stableChoiceRank`**: the matching-type shuffle uses the same u32 polynomial
//!   hash as the TypeScript implementation; multi-byte Unicode chars outside the BMP
//!   produce different values because Rust `char as u32` != JS `charCodeAt` for
//!   surrogate pairs — unlikely in practice for quiz content.
//! - **`tulearnAccessErrorResponse`**: the legacy route maps specific TS error
//!   classes to 403/404. This port maps `NotEnabled` → 404, `Forbidden` → 403,
//!   and unexpected failures → 500 with a static message.

use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashSet;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const TULEARN_DISABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";
const MODULE_NOT_FOUND_MESSAGE: &str = "Module not found";
const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load module";

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

struct RouteParams<'a> {
    raw_ws_id: &'a str,
    course_id: &'a str,
    module_id: &'a str,
}

fn extract_route_params(path: &str) -> Option<RouteParams<'_>> {
    let segments: Vec<&str> = path
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .collect();

    // /api/v1/workspaces/:wsId/tulearn/courses/:courseId/modules/:moduleId
    // [0]  [1] [2]          [3]    [4]      [5]     [6]       [7]      [8]
    if segments.len() == 9
        && segments.first() == Some(&"api")
        && segments.get(1) == Some(&"v1")
        && segments.get(2) == Some(&"workspaces")
        && segments.get(4) == Some(&"tulearn")
        && segments.get(5) == Some(&"courses")
        && segments.get(7) == Some(&"modules")
    {
        let raw_ws_id = segments[3];
        let course_id = segments[6];
        let module_id = segments[8];
        if raw_ws_id.is_empty() || course_id.is_empty() || module_id.is_empty() {
            return None;
        }
        Some(RouteParams {
            raw_ws_id,
            course_id,
            module_id,
        })
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_tulearn_courses_courseid_modules_moduleid_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let params = extract_route_params(request.path)?;

    Some(match request.method {
        "GET" => module_detail_response(config, request, params, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET response
// ---------------------------------------------------------------------------

async fn module_detail_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    params: RouteParams<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate caller.
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

    // Resolve student identity.
    let student_id = student_id_from_url(request.url);
    let subject = match resolve_tulearn_subject(
        contact_data,
        outbound,
        params.raw_ws_id,
        &user_id,
        &access_token,
        student_id.as_deref(),
    )
    .await
    {
        Ok(subject) => subject,
        Err(TulearnError::NotEnabled) => return message_response(404, TULEARN_DISABLED_MESSAGE),
        Err(TulearnError::Forbidden) => return message_response(403, NO_LEARNER_ACCESS_MESSAGE),
        Err(TulearnError::Internal) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    // Find the module in the student's course, checking assignment & locked state.
    let module_summary = match find_module_in_course(
        contact_data,
        outbound,
        &subject,
        params.course_id,
        params.module_id,
    )
    .await
    {
        Ok(Some(summary)) => summary,
        Ok(None) => return message_response(404, MODULE_NOT_FOUND_MESSAGE),
        Err(()) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    // Fetch module content, flashcards, quizzes, quiz sets.
    let detail =
        match fetch_module_detail(contact_data, outbound, params.module_id, params.course_id).await
        {
            Ok(detail) => detail,
            Err(()) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
        };

    // Fetch submissions for this student.
    let submissions = match fetch_submissions(
        contact_data,
        outbound,
        params.module_id,
        &subject.student_platform_user_id,
    )
    .await
    {
        Ok(subs) => subs,
        Err(()) => return message_response(500, FAILED_TO_LOAD_MESSAGE),
    };

    let body = json!({
        "id": module_summary.id,
        "name": module_summary.name,
        "sort_key": module_summary.sort_key,
        "is_published": module_summary.is_published,
        "completed": module_summary.completed,
        "locked": module_summary.locked,
        "counts": {
            "flashcards": detail.flashcards.len(),
            "quizzes": detail.quizzes.len(),
            "quizSets": detail.quiz_sets.len(),
        },
        "content": detail.content,
        "extra_content": detail.extra_content,
        "youtube_links": detail.youtube_links,
        "flashcards": detail.flashcards,
        "quizzes": detail.quizzes,
        "quizSets": detail.quiz_sets,
        "submissions": submissions,
    });

    no_store_response(json_response(200, body))
}

// ---------------------------------------------------------------------------
// Subject resolution (mirrors resolveTulearnSubject from service.ts / access.ts)
// ---------------------------------------------------------------------------

enum TulearnError {
    NotEnabled,
    Forbidden,
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
        return Err(TulearnError::NotEnabled);
    }

    let student_id = student_id.filter(|id| !id.is_empty());

    // Self-student path (caller is themselves the learner).
    if student_id.is_none()
        && let Some(workspace_user_id) =
            resolve_self_student(contact_data, outbound, &ws_id, user_id)
                .await
                .map_err(|()| TulearnError::Internal)?
    {
        return Ok(TulearnSubject {
            ws_id,
            student_platform_user_id: user_id.to_owned(),
            student_workspace_user_id: workspace_user_id,
        });
    }

    // Parent link path.
    let link = parent_student_link(contact_data, outbound, &ws_id, user_id, student_id)
        .await
        .map_err(|()| TulearnError::Internal)?;

    let Some(link) = link else {
        return Err(TulearnError::Forbidden);
    };

    Ok(TulearnSubject {
        ws_id,
        student_platform_user_id: link.student_platform_user_id,
        student_workspace_user_id: link.student_workspace_user_id,
    })
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
}

async fn resolve_self_student(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    platform_user_id: &str,
) -> Result<Option<String>, ()> {
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<LinkedUserRow> = response.json().map_err(|_| ())?;
    Ok(rows
        .into_iter()
        .next()
        .and_then(|row| row.virtual_user_id)
        .filter(|id| !id.trim().is_empty()))
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
        .map(|v| v.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false))
}

// ---------------------------------------------------------------------------
// Module validation: course assignment check + locked/completed state
// ---------------------------------------------------------------------------

struct ModuleSummary {
    id: String,
    name: Option<String>,
    sort_key: Option<f64>,
    is_published: bool,
    completed: bool,
    locked: bool,
}

#[derive(Deserialize)]
struct AssignedCourseRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct CourseModuleRow {
    id: Option<String>,
    name: Option<String>,
    sort_key: Option<f64>,
    is_published: Option<bool>,
}

#[derive(Deserialize)]
struct CompletionRow {
    module_id: Option<String>,
}

async fn find_module_in_course(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    subject: &TulearnSubject,
    course_id: &str,
    module_id: &str,
) -> Result<Option<ModuleSummary>, ()> {
    // Verify course is assigned to student.
    let select = "group_id,workspace_user_groups!workspace_user_roles_users_role_id_fkey!inner(id,ws_id,archived,is_guest,is_course_published)";
    let Some(assign_url) = contact_data.rest_url(
        "workspace_user_groups_users",
        &[
            ("select", select.to_owned()),
            (
                "user_id",
                format!("eq.{}", subject.student_workspace_user_id),
            ),
            (
                "workspace_user_groups.ws_id",
                format!("eq.{}", subject.ws_id),
            ),
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
    let assign_resp = service_role_get(contact_data, outbound, &assign_url, None).await?;
    if !(200..300).contains(&assign_resp.status) {
        return Err(());
    }
    let assigned_rows: Vec<AssignedCourseRow> = assign_resp.json().map_err(|_| ())?;
    let course_is_assigned = assigned_rows
        .iter()
        .any(|row| row.group_id.as_deref() == Some(course_id));
    if !course_is_assigned {
        return Ok(None);
    }

    // Fetch published modules for this course, ordered by sort_key.
    let Some(modules_url) = contact_data.rest_url(
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
    let modules_resp = service_role_get(contact_data, outbound, &modules_url, None).await?;
    if !(200..300).contains(&modules_resp.status) {
        return Err(());
    }
    let module_rows: Vec<CourseModuleRow> = modules_resp.json().map_err(|_| ())?;

    let module_id_list: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    // Completed module ids for this student.
    let completed_ids = if module_id_list.is_empty() {
        HashSet::new()
    } else {
        fetch_completed_module_ids(
            contact_data,
            outbound,
            &subject.student_platform_user_id,
            &module_id_list,
        )
        .await?
    };

    // Apply locked/completed cascade (same logic as getLearnerCourseDetail).
    let mut prior_incomplete = false;
    for module in module_rows {
        let Some(id) = module.id else { continue };
        let is_published = module.is_published.unwrap_or(false);
        let completed = completed_ids.contains(&id);
        let locked = !is_published || prior_incomplete;
        if !completed && is_published {
            prior_incomplete = true;
        }
        if id == module_id {
            if locked {
                return Ok(None);
            }
            return Ok(Some(ModuleSummary {
                id,
                name: module.name,
                sort_key: module.sort_key,
                is_published,
                completed,
                locked,
            }));
        }
    }

    Ok(None)
}

async fn fetch_completed_module_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    student_platform_user_id: &str,
    module_ids: &[String],
) -> Result<HashSet<String>, ()> {
    let in_filter = in_list(module_ids);
    let Some(url) = contact_data.rest_url(
        "course_module_completion_status",
        &[
            ("select", "module_id".to_owned()),
            ("user_id", format!("eq.{student_platform_user_id}")),
            ("completion_status", "eq.true".to_owned()),
            ("module_id", format!("in.{in_filter}")),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<CompletionRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|r| r.module_id).collect())
}

// ---------------------------------------------------------------------------
// Module detail fetch (mirrors getLearnerModuleDetail's four parallel reads)
// ---------------------------------------------------------------------------

struct ModuleDetail {
    content: Value,
    extra_content: Value,
    youtube_links: Value,
    flashcards: Vec<Value>,
    quizzes: Vec<Value>,
    quiz_sets: Vec<Value>,
}

#[derive(Deserialize)]
struct ModuleContentRow {
    content: Option<Value>,
    extra_content: Option<Value>,
    youtube_links: Option<Value>,
}

#[derive(Deserialize)]
struct FlashcardJoinRow {
    workspace_flashcards: Option<Value>,
}

#[derive(Deserialize)]
struct QuizJoinRow {
    workspace_quizzes: Option<Value>,
}

#[derive(Deserialize)]
struct QuizSetJoinRow {
    workspace_quiz_sets: Option<Value>,
}

async fn fetch_module_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    module_id: &str,
    course_id: &str,
) -> Result<ModuleDetail, ()> {
    // Content fields.
    let Some(content_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "content,extra_content,youtube_links".to_owned()),
            ("id", format!("eq.{module_id}")),
            ("group_id", format!("eq.{course_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let content_resp = service_role_get(contact_data, outbound, &content_url, None).await?;
    if !(200..300).contains(&content_resp.status) {
        return Err(());
    }
    let content_rows: Vec<ModuleContentRow> = content_resp.json().map_err(|_| ())?;
    let Some(content_row) = content_rows.into_iter().next() else {
        return Err(());
    };

    // Flashcards.
    let Some(flashcards_url) = contact_data.rest_url(
        "course_module_flashcards",
        &[
            ("select", "workspace_flashcards(id,front,back)".to_owned()),
            ("module_id", format!("eq.{module_id}")),
        ],
    ) else {
        return Err(());
    };
    let flashcards_resp = service_role_get(contact_data, outbound, &flashcards_url, None).await?;
    if !(200..300).contains(&flashcards_resp.status) {
        return Err(());
    }
    let flashcard_rows: Vec<FlashcardJoinRow> = flashcards_resp.json().map_err(|_| ())?;
    let flashcards: Vec<Value> = flashcard_rows
        .into_iter()
        .filter_map(|row| first_embed(row.workspace_flashcards))
        .collect();

    // Quizzes.
    let Some(quizzes_url) = contact_data.rest_url(
        "course_module_quizzes",
        &[
            (
                "select",
                "workspace_quizzes(id,question,type,content,score,quiz_options(id,value,explanation))".to_owned(),
            ),
            ("module_id", format!("eq.{module_id}")),
        ],
    ) else {
        return Err(());
    };
    let quizzes_resp = service_role_get(contact_data, outbound, &quizzes_url, None).await?;
    if !(200..300).contains(&quizzes_resp.status) {
        return Err(());
    }
    let quiz_rows: Vec<QuizJoinRow> = quizzes_resp.json().map_err(|_| ())?;
    let quizzes: Vec<Value> = quiz_rows
        .into_iter()
        .filter_map(|row| first_embed(row.workspace_quizzes))
        .map(sanitize_learner_quiz)
        .collect();

    // Quiz sets.
    let Some(quiz_sets_url) = contact_data.rest_url(
        "course_module_quiz_sets",
        &[
            ("select", "workspace_quiz_sets(id,name)".to_owned()),
            ("module_id", format!("eq.{module_id}")),
        ],
    ) else {
        return Err(());
    };
    let quiz_sets_resp = service_role_get(contact_data, outbound, &quiz_sets_url, None).await?;
    if !(200..300).contains(&quiz_sets_resp.status) {
        return Err(());
    }
    let quiz_set_rows: Vec<QuizSetJoinRow> = quiz_sets_resp.json().map_err(|_| ())?;
    let quiz_sets: Vec<Value> = quiz_set_rows
        .into_iter()
        .filter_map(|row| first_embed(row.workspace_quiz_sets))
        .collect();

    Ok(ModuleDetail {
        content: content_row.content.unwrap_or(Value::Null),
        extra_content: content_row.extra_content.unwrap_or(Value::Null),
        youtube_links: content_row.youtube_links.unwrap_or(Value::Null),
        flashcards,
        quizzes,
        quiz_sets,
    })
}

// ---------------------------------------------------------------------------
// Submissions fetch (mirrors the course_module_quiz_submissions query in GET)
// ---------------------------------------------------------------------------

async fn fetch_submissions(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    module_id: &str,
    student_platform_user_id: &str,
) -> Result<Vec<Value>, ()> {
    let Some(url) = contact_data.rest_url(
        "course_module_quiz_submissions",
        &[
            (
                "select",
                "quiz_id,selected_option_id,answer,is_correct,created_at".to_owned(),
            ),
            ("module_id", format!("eq.{module_id}")),
            ("user_id", format!("eq.{student_platform_user_id}")),
            ("order", "created_at.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<Value>>().map_err(|_| ())
}

// ---------------------------------------------------------------------------
// Quiz sanitization (mirrors sanitizeLearnerQuiz from courses.ts)
// ---------------------------------------------------------------------------

/// Removes the `answer` field and sanitizes `content` for matching-type quizzes.
fn sanitize_learner_quiz(mut quiz: Value) -> Value {
    let Some(obj) = quiz.as_object_mut() else {
        return quiz;
    };

    // Always strip the answer field (not present in LearnerQuiz).
    obj.remove("answer");

    let quiz_type = obj
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_owned();

    if quiz_type == "matching" {
        let quiz_id = obj
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let content = obj.get("content").cloned().unwrap_or(Value::Null);
        let sanitized = matching_prompt_content(&quiz_id, &content);
        obj.insert("content".to_owned(), sanitized);
    }

    quiz
}

/// Mirrors `matchingPromptContent`: returns `{ choices, pairs }` where choices
/// are the right-side values shuffled by a deterministic hash and pairs expose
/// only the left-side prompts.
fn matching_prompt_content(quiz_id: &str, content: &Value) -> Value {
    let pairs = get_matching_pairs(content);
    let mut choices: Vec<(u32, String)> = pairs
        .iter()
        .enumerate()
        .map(|(index, pair)| (stable_choice_rank(quiz_id, &pair.1, index), pair.1.clone()))
        .collect();
    choices.sort_by_key(|(rank, _)| *rank);

    let choices_json: Vec<Value> = choices
        .into_iter()
        .map(|(_, value)| Value::String(value))
        .collect();

    let left_prompts: Vec<Value> = pairs
        .into_iter()
        .map(|(left, _)| json!({ "left": left }))
        .collect();

    json!({ "choices": choices_json, "pairs": left_prompts })
}

/// Extracts `(left, right)` pairs from a JSON value, mirroring
/// `getMatchingPairs` from `quiz-content.ts`.
fn get_matching_pairs(value: &Value) -> Vec<(String, String)> {
    let arr = if let Some(arr) = value.as_array() {
        arr.as_slice()
    } else if let Some(obj) = value.as_object() {
        if let Some(Value::Array(pairs)) = obj.get("pairs") {
            pairs.as_slice()
        } else {
            return Vec::new();
        }
    } else {
        return Vec::new();
    };

    arr.iter()
        .filter_map(|pair| {
            let obj = pair.as_object()?;
            let left = obj.get("left")?.as_str()?.to_owned();
            let right = obj.get("right")?.as_str()?.to_owned();
            if left.is_empty() || right.is_empty() {
                None
            } else {
                Some((left, right))
            }
        })
        .collect()
}

/// Deterministic shuffle rank, mirrors `stableChoiceRank` in courses.ts.
///
/// JavaScript's `charCodeAt` returns UTF-16 code units. For BMP characters
/// (U+0000–U+FFFF) `char as u32` matches. Surrogate pairs (rare in quiz
/// content) would differ; see module-level doc comment.
fn stable_choice_rank(quiz_id: &str, value: &str, index: usize) -> u32 {
    let input = format!("{quiz_id}:{value}:{index}");
    let mut hash: u32 = 0;
    for ch in input.chars() {
        hash = hash.wrapping_mul(31).wrapping_add(ch as u32);
    }
    hash
}

// ---------------------------------------------------------------------------
// Workspace-id normalization (file-local copy mirroring workspaces_tulearn_home.rs)
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
        if let Some(ws_id) =
            workspace_id_by_handle(contact_data, outbound, &handle, access_token).await?
        {
            return Ok(ws_id);
        }
        if let Some(ws_id) =
            workspace_id_by_handle_service_role(contact_data, outbound, &handle).await?
        {
            return Ok(ws_id);
        }
    }

    Ok(resolved_ws_id)
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
            .all(|(index, c)| match index {
                8 | 13 | 18 | 23 => c == '-',
                _ => c.is_ascii_hexdigit(),
            })
}

fn is_workspace_handle(value: &str) -> bool {
    let length = value.len();
    if length == 0 || length > 64 {
        return false;
    }
    value.chars().enumerate().all(|(index, c)| {
        let is_edge = index == 0 || index + 1 == length;
        c.is_ascii_lowercase() || c.is_ascii_digit() || (!is_edge && matches!(c, '_' | '-'))
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
// Small utilities
// ---------------------------------------------------------------------------

fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|u| url::Url::parse(u).ok())?;
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

/// Extracts the first embedded object from a PostgREST one-to-one or
/// one-to-many embed (which may be returned as an object or a single-element
/// array).
fn first_embed(value: Option<Value>) -> Option<Value> {
    match value? {
        Value::Array(arr) => arr.into_iter().next(),
        obj @ Value::Object(_) => Some(obj),
        _ => None,
    }
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

    // --- Path extraction ---

    #[test]
    fn test_extract_route_params_valid() {
        let path = "/api/v1/workspaces/ws-123/tulearn/courses/course-abc/modules/mod-xyz";
        let params = extract_route_params(path).expect("should match");
        assert_eq!(params.raw_ws_id, "ws-123");
        assert_eq!(params.course_id, "course-abc");
        assert_eq!(params.module_id, "mod-xyz");
    }

    #[test]
    fn test_extract_route_params_trailing_slash() {
        // trim_matches('/') removes the trailing slash before splitting, so the
        // path still produces 9 segments and matches correctly.
        let path = "/api/v1/workspaces/ws-123/tulearn/courses/course-abc/modules/mod-xyz/";
        let params = extract_route_params(path).expect("should match after trim");
        assert_eq!(params.raw_ws_id, "ws-123");
        assert_eq!(params.module_id, "mod-xyz");
    }

    #[test]
    fn test_extract_route_params_wrong_path() {
        assert!(extract_route_params("/api/v1/workspaces/ws/tulearn/home").is_none());
        assert!(extract_route_params("/api/v1/workspaces/ws/courses/course/modules/mod").is_none());
    }

    #[test]
    fn test_extract_route_params_empty_segment() {
        let path = "/api/v1/workspaces//tulearn/courses/course-abc/modules/mod-xyz";
        assert!(extract_route_params(path).is_none());
    }

    // --- Workspace id helpers ---

    #[test]
    fn test_is_workspace_uuid_literal() {
        assert!(is_workspace_uuid_literal(
            "00000000-0000-0000-0000-000000000000"
        ));
        assert!(is_workspace_uuid_literal(
            "550e8400-e29b-41d4-a716-446655440000"
        ));
        assert!(!is_workspace_uuid_literal("personal"));
        assert!(!is_workspace_uuid_literal("too-short"));
    }

    #[test]
    fn test_resolve_workspace_id_internal() {
        assert_eq!(resolve_workspace_id("internal"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("INTERNAL"), ROOT_WORKSPACE_ID);
        assert_eq!(resolve_workspace_id("my-handle"), "my-handle");
    }

    // --- stable_choice_rank ---

    #[test]
    fn test_stable_choice_rank_deterministic() {
        let r1 = stable_choice_rank("quiz-id", "apple", 0);
        let r2 = stable_choice_rank("quiz-id", "apple", 0);
        assert_eq!(r1, r2);
    }

    #[test]
    fn test_stable_choice_rank_differs_by_value() {
        let ra = stable_choice_rank("quiz-id", "apple", 0);
        let rb = stable_choice_rank("quiz-id", "banana", 0);
        assert_ne!(ra, rb);
    }

    // --- get_matching_pairs ---

    #[test]
    fn test_get_matching_pairs_from_array() {
        let content = json!([
            { "left": "A", "right": "1" },
            { "left": "B", "right": "2" }
        ]);
        let pairs = get_matching_pairs(&content);
        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0], ("A".to_owned(), "1".to_owned()));
        assert_eq!(pairs[1], ("B".to_owned(), "2".to_owned()));
    }

    #[test]
    fn test_get_matching_pairs_from_object_with_pairs_key() {
        let content = json!({
            "pairs": [
                { "left": "X", "right": "Y" }
            ]
        });
        let pairs = get_matching_pairs(&content);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0], ("X".to_owned(), "Y".to_owned()));
    }

    #[test]
    fn test_get_matching_pairs_filters_empty() {
        let content = json!([
            { "left": "", "right": "1" },
            { "left": "A", "right": "2" }
        ]);
        let pairs = get_matching_pairs(&content);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, "A");
    }

    // --- sanitize_learner_quiz ---

    #[test]
    fn test_sanitize_removes_answer_field() {
        let quiz = json!({
            "id": "q1",
            "type": "multiple_choice",
            "question": "What?",
            "content": null,
            "score": 1,
            "answer": "secret"
        });
        let sanitized = sanitize_learner_quiz(quiz);
        assert!(sanitized.get("answer").is_none());
        assert_eq!(sanitized["type"], "multiple_choice");
    }

    #[test]
    fn test_sanitize_matching_replaces_content() {
        let quiz = json!({
            "id": "q2",
            "type": "matching",
            "question": "Match",
            "content": [
                { "left": "A", "right": "1" },
                { "left": "B", "right": "2" }
            ],
            "score": 1
        });
        let sanitized = sanitize_learner_quiz(quiz);
        let content = &sanitized["content"];
        assert!(content.get("choices").is_some());
        assert!(content.get("pairs").is_some());
        let pairs = content["pairs"].as_array().unwrap();
        // Each pair should only have "left".
        for pair in pairs {
            assert!(pair.get("left").is_some());
            assert!(pair.get("right").is_none());
        }
    }

    // --- in_list ---

    #[test]
    fn test_in_list_formats_correctly() {
        let ids = vec!["id1".to_owned(), "id2".to_owned()];
        assert_eq!(in_list(&ids), r#"("id1","id2")"#);
    }

    // --- student_id_from_url ---

    #[test]
    fn test_student_id_from_url_present() {
        let url = "https://example.com/path?studentId=abc123";
        assert_eq!(student_id_from_url(Some(url)), Some("abc123".to_owned()));
    }

    #[test]
    fn test_student_id_from_url_empty() {
        let url = "https://example.com/path?studentId=";
        assert_eq!(student_id_from_url(Some(url)), None);
    }

    #[test]
    fn test_student_id_from_url_absent() {
        let url = "https://example.com/path";
        assert_eq!(student_id_from_url(Some(url)), None);
    }
}
