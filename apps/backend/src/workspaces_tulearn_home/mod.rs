//! Handler for `GET /api/v1/workspaces/:wsId/tulearn/home`.
//!
//! Ported from `apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/home/route.ts`
//! and its `@/lib/tulearn/*` service helpers (`access.ts`, `learner-state.ts`,
//! `courses.ts`, `activity.ts`). The legacy route authenticates the session
//! (with `allowAppSessionAuth: true`), resolves the "subject" learner (either
//! the caller themselves as a student, or a learner the caller is a parent of
//! via `tulearn_parent_student_links`), then fans out five service-role reads
//! (`state`, `courses`, `assignments`, `marks`, `recommendedPractice`) and
//! returns them in a single JSON envelope.
//!
//! IMPORTANT (single-file constraint): this module intentionally re-implements,
//! as file-local fns, several helpers that exist privately in other modules
//! (e.g. the workspace-id normalization helpers in `workspace_habits_access.rs`,
//! and `request_has_app_session_token`-style app-session handling). They are
//! copied here so this module compiles without editing any shared file. See the
//! integrator notes returned with this task.

pub(crate) use serde::Deserialize;
pub(crate) use serde_json::{Value, json};

pub(crate) use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

mod access;
mod activity;
mod courses;
mod learner_state;
mod rest;
mod utils;
mod workspace_id;

use access::*;
use activity::*;
use courses::*;
use learner_state::*;
use rest::*;
use utils::*;
use workspace_id::*;

pub(crate) const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
pub(crate) const DEFAULT_HEARTS: i64 = 5;
pub(crate) const HEART_REFILL_MS: i128 = 4 * 60 * 60 * 1000;

pub(crate) const INTERNAL_WORKSPACE_SLUG: &str = "internal";
pub(crate) const PERSONAL_WORKSPACE_SLUG: &str = "personal";
pub(crate) const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

pub(crate) const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
pub(crate) const INTERNAL_ERROR_MESSAGE: &str = "Failed to load learner home";
pub(crate) const TULEARN_DISABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
pub(crate) const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/tulearn/home";

pub(crate) async fn handle_workspaces_tulearn_home_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = tulearn_home_ws_id(request.path)?;

    Some(match request.method {
        "GET" => tulearn_home_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

fn tulearn_home_ws_id(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

async fn tulearn_home_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate the session. The legacy route allows app-session auth, but
    // app-session tokens are resolved to a Supabase user by upstream
    // middleware; here we accept the same caller access token used elsewhere.
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

    // resolveTulearnSubject(...)
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

    // The five parallel service reads. (Cloudflare Workers is single-threaded
    // for our purposes; we await them sequentially which preserves semantics.)
    let state = match get_learner_state(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_platform_user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let courses = match get_learner_course_summaries(
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

    let assignments = match get_learner_assignments(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let marks = match get_learner_marks(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(value) => value,
        Err(()) => return message_response(500, INTERNAL_ERROR_MESSAGE),
    };

    let recommended_practice = match get_recommended_practice_item(
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

    let body = json!({
        "role": subject.role,
        "readOnly": subject.read_only,
        "student": {
            "id": subject.student_workspace_user_id,
            "name": subject.student_name,
        },
        "state": state,
        "courses": courses,
        "assignments": assignments,
        "marks": marks,
        "recommendedPractice": recommended_practice,
    });

    json_response(200, body)
}
