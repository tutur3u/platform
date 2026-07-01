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

pub(crate) use serde::Deserialize;
pub(crate) use serde_json::{Value, json};
pub(crate) use std::collections::HashSet;

pub(crate) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod helpers;
mod module_detail;
mod module_validation;
mod subject;
#[cfg(test)]
mod tests;
mod workspace_id;

use helpers::*;
use module_detail::*;
use module_validation::*;
use subject::*;
use workspace_id::*;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub(crate) const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
pub(crate) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(crate) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(crate) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(crate) const TULEARN_DISABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
pub(crate) const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";
pub(crate) const MODULE_NOT_FOUND_MESSAGE: &str = "Module not found";
pub(crate) const FAILED_TO_LOAD_MESSAGE: &str = "Failed to load module";

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
