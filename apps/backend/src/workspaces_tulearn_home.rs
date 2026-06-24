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

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const DEFAULT_HEARTS: i64 = 5;
const HEART_REFILL_MS: i128 = 4 * 60 * 60 * 1000;

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_ERROR_MESSAGE: &str = "Failed to load learner home";
const TULEARN_DISABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";

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

// ---------------------------------------------------------------------------
// Subject resolution (port of access.ts::resolveTulearnSubject).
// ---------------------------------------------------------------------------

enum TulearnError {
    /// Maps to TulearnAccessError (403/404).
    Access { status: u16, message: &'static str },
    /// Any unexpected failure -> 500.
    Internal,
}

struct TulearnSubject {
    role: &'static str,
    read_only: bool,
    ws_id: String,
    student_platform_user_id: String,
    student_workspace_user_id: String,
    student_name: Option<String>,
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

    if student_id.is_none() {
        if let Some(self_student) = self_student {
            return Ok(TulearnSubject {
                role: "student",
                read_only: false,
                ws_id,
                student_platform_user_id: user_id.to_owned(),
                student_workspace_user_id: self_student.workspace_user_id,
                student_name: self_student.name,
            });
        }
    }

    // Parent link lookup.
    let link = parent_student_link(contact_data, outbound, &ws_id, user_id, student_id)
        .await
        .map_err(|()| TulearnError::Internal)?;
    let Some(link) = link else {
        return Err(TulearnError::Access {
            status: 403,
            message: NO_LEARNER_ACCESS_MESSAGE,
        });
    };

    let student_name = workspace_user_display_name(
        contact_data,
        outbound,
        &ws_id,
        &link.student_workspace_user_id,
    )
    .await
    .map_err(|()| TulearnError::Internal)?;

    Ok(TulearnSubject {
        role: "parent",
        read_only: true,
        ws_id,
        student_platform_user_id: link.student_platform_user_id,
        student_workspace_user_id: link.student_workspace_user_id,
        student_name,
    })
}

struct SelfStudent {
    workspace_user_id: String,
    name: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserRow {
    id: Option<String>,
    full_name: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
}

fn to_display_name(
    display_name: Option<&str>,
    full_name: Option<&str>,
    email: Option<&str>,
) -> Option<String> {
    // Mirrors helpers.ts::toDisplayName: display_name || full_name || email || null.
    [display_name, full_name, email]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[derive(Deserialize)]
struct LinkedUserRow {
    virtual_user_id: Option<String>,
    workspace_users: Option<Value>,
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
            (
                "select",
                "virtual_user_id,workspace_users!inner(id,full_name,display_name,email,avatar_url,ws_id)"
                    .to_owned(),
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
    let Some(row) = rows.into_iter().next() else {
        return Ok(None);
    };

    let Some(virtual_user_id) = row.virtual_user_id.filter(|id| !id.trim().is_empty()) else {
        return Ok(None);
    };
    // PostgREST may return an embedded one-to-one as object or single-element array.
    let workspace_user = first_object(row.workspace_users.as_ref());
    let Some(workspace_user) = workspace_user else {
        return Ok(None);
    };

    let name = to_display_name(
        workspace_user.get("display_name").and_then(Value::as_str),
        workspace_user.get("full_name").and_then(Value::as_str),
        workspace_user.get("email").and_then(Value::as_str),
    );

    Ok(Some(SelfStudent {
        workspace_user_id: virtual_user_id,
        name,
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

async fn workspace_user_display_name(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    workspace_user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            (
                "select",
                "id,full_name,display_name,email,avatar_url".to_owned(),
            ),
            ("id", format!("eq.{workspace_user_id}")),
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

    let rows: Vec<WorkspaceUserRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().next().and_then(|row| {
        to_display_name(
            row.display_name.as_deref(),
            row.full_name.as_deref(),
            row.email.as_deref(),
        )
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
// Learner state (port of learner-state.ts::getLearnerState).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LearnerStateRow {
    hearts: Option<i64>,
    max_hearts: Option<i64>,
    xp_total: Option<i64>,
    current_streak: Option<i64>,
    longest_streak: Option<i64>,
    streak_freezes: Option<i64>,
    last_activity_date: Option<String>,
    last_heart_refill_at: Option<String>,
}

fn public_state_json(row: &LearnerStateRow) -> Value {
    json!({
        "hearts": row.hearts.unwrap_or(0),
        "max_hearts": row.max_hearts.unwrap_or(0),
        "xp_total": row.xp_total.unwrap_or(0),
        "current_streak": row.current_streak.unwrap_or(0),
        "longest_streak": row.longest_streak.unwrap_or(0),
        "streak_freezes": row.streak_freezes.unwrap_or(0),
        "last_activity_date": row.last_activity_date,
    })
}

async fn get_learner_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Value, ()> {
    let select = "hearts,max_hearts,xp_total,current_streak,longest_streak,streak_freezes,last_activity_date,last_heart_refill_at";
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[
            ("select", select.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LearnerStateRow> = response.json().map_err(|_| ())?;
    let Some(row) = rows.into_iter().next() else {
        // No state yet -> upsert an initial row (ignoreDuplicates) then read it.
        upsert_initial_learner_state(contact_data, outbound, ws_id, user_id).await?;
        return read_public_learner_state(contact_data, outbound, ws_id, user_id).await;
    };

    // Heart-refill mutation: only when hearts < max_hearts and the refill window
    // has elapsed since `last_heart_refill_at`.
    let hearts = row.hearts.unwrap_or(0);
    let max_hearts = row.max_hearts.unwrap_or(0);
    if hearts < max_hearts {
        if let Some(last_refill_iso) = row.last_heart_refill_at.as_deref() {
            if let Some(last_refill_ms) = parse_iso_millis(last_refill_iso) {
                if last_refill_ms > 0 {
                    let now_ms = now_millis();
                    if now_ms - last_refill_ms >= HEART_REFILL_MS {
                        return refill_hearts(
                            contact_data,
                            outbound,
                            ws_id,
                            user_id,
                            hearts,
                            max_hearts,
                            last_refill_iso,
                        )
                        .await;
                    }
                }
            }
        }
    }

    Ok(public_state_json(&row))
}

async fn upsert_initial_learner_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<(), ()> {
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[("on_conflict", "ws_id,user_id".to_owned())],
    ) else {
        return Err(());
    };
    let body = json!({
        "ws_id": ws_id,
        "user_id": user_id,
        "hearts": DEFAULT_HEARTS,
        "max_hearts": DEFAULT_HEARTS,
    })
    .to_string();

    // Prefer: resolution=ignore-duplicates mirrors `upsert(..., { ignoreDuplicates: true })`.
    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "resolution=ignore-duplicates")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;

    // 201 created or 200 (already exists / ignored) are both acceptable.
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(())
}

async fn read_public_learner_state(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Value, ()> {
    let select = "hearts,max_hearts,xp_total,current_streak,longest_streak,streak_freezes,last_activity_date";
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[
            ("select", select.to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<LearnerStateRow> = response.json().map_err(|_| ())?;
    // legacy uses `.single()` here; a missing row is an error.
    let row = rows.into_iter().next().ok_or(())?;
    Ok(public_state_json(&row))
}

#[allow(clippy::too_many_arguments)]
async fn refill_hearts(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
    expected_hearts: i64,
    max_hearts: i64,
    expected_last_refill_iso: &str,
) -> Result<Value, ()> {
    let now = now_iso();
    let select = "hearts,max_hearts,xp_total,current_streak,longest_streak,streak_freezes,last_activity_date";
    // Conditional optimistic update: filter also on current hearts and
    // last_heart_refill_at so concurrent refills don't double-apply.
    let Some(url) = contact_data.rest_url(
        "tulearn_learner_state",
        &[
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("hearts", format!("eq.{expected_hearts}")),
            (
                "last_heart_refill_at",
                format!("eq.{expected_last_refill_iso}"),
            ),
            ("select", select.to_owned()),
        ],
    ) else {
        return Err(());
    };
    let body = json!({
        "hearts": max_hearts,
        "last_heart_refill_at": now,
        "updated_at": now,
    })
    .to_string();

    let service_role_key = contact_data.service_role_key().ok_or(())?;
    let authorization = format!("Bearer {service_role_key}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Patch, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_header("Prefer", "return=representation")
                .with_body(&body),
        )
        .await
        .map_err(|_| ())?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    let rows: Vec<LearnerStateRow> = response.json().map_err(|_| ())?;
    match rows.into_iter().next() {
        Some(row) => Ok(public_state_json(&row)),
        // The conditional update matched no row (a concurrent refill won the
        // race) -> re-read the public state, mirroring the legacy fallback.
        None => read_public_learner_state(contact_data, outbound, ws_id, user_id).await,
    }
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
// Course summaries (port of courses.ts::getLearnerCourseSummaries).
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct CourseSummary {
    id: String,
    name: Option<String>,
    description: Option<String>,
    completed_modules: usize,
    total_modules: usize,
    progress: i64,
}

fn course_summary_json(course: &CourseSummary) -> Value {
    json!({
        "id": course.id,
        "name": course.name,
        "description": course.description,
        "completedModules": course.completed_modules,
        "totalModules": course.total_modules,
        "progress": course.progress,
    })
}

#[derive(Deserialize)]
struct CourseRow {
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
struct ModuleIdRow {
    module_id: Option<String>,
}

async fn fetch_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    course_ids: &[String],
) -> Result<Vec<CourseSummary>, ()> {
    if course_ids.is_empty() {
        return Ok(Vec::new());
    }
    let in_filter = in_list(course_ids);

    // Courses.
    let Some(courses_url) = contact_data.rest_url(
        "workspace_user_groups",
        &[
            ("select", "id,name,description".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("id", format!("in.{in_filter}")),
            ("order", "name.asc".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let courses_resp = service_role_get(contact_data, outbound, &courses_url, None).await?;
    if !(200..300).contains(&courses_resp.status) {
        return Err(());
    }
    let courses: Vec<CourseRow> = courses_resp.json().map_err(|_| ())?;

    // Published modules per course.
    let Some(modules_url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "id,group_id".to_owned()),
            ("group_id", format!("in.{in_filter}")),
            ("is_published", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let modules_resp = service_role_get(contact_data, outbound, &modules_url, None).await?;
    if !(200..300).contains(&modules_resp.status) {
        return Err(());
    }
    let modules: Vec<ModuleGroupRow> = modules_resp.json().map_err(|_| ())?;

    // Completed module ids for this student (platform user id).
    let completed_module_ids =
        fetch_completed_module_ids(contact_data, outbound, student_platform_user_id, None).await?;

    // Index modules by course.
    let mut modules_by_course: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for module in modules {
        if let (Some(id), Some(group_id)) = (module.id, module.group_id) {
            modules_by_course.entry(group_id).or_default().push(id);
        }
    }

    let mut summaries = Vec::with_capacity(courses.len());
    for course in courses {
        let Some(course_id) = course.id else { continue };
        let module_ids = modules_by_course
            .get(&course_id)
            .cloned()
            .unwrap_or_default();
        let completed = module_ids
            .iter()
            .filter(|id| completed_module_ids.contains(*id))
            .count();
        let total = module_ids.len();
        let progress = if total > 0 {
            ((completed as f64 / total as f64) * 100.0).round() as i64
        } else {
            0
        };
        summaries.push(CourseSummary {
            id: course_id,
            name: course.name,
            description: course.description,
            completed_modules: completed,
            total_modules: total,
            progress,
        });
    }

    Ok(summaries)
}

async fn get_learner_course_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    let summaries = fetch_course_summaries(
        contact_data,
        outbound,
        ws_id,
        student_platform_user_id,
        &course_ids,
    )
    .await?;
    Ok(Value::Array(
        summaries.iter().map(course_summary_json).collect(),
    ))
}

/// `course_module_completion_status` filtered on the student's platform user id
/// and `completion_status = true`. When `module_ids` is provided, also filters
/// by `module_id in (...)`.
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
        if module_ids.is_empty() {
            return Ok(std::collections::HashSet::new());
        }
        params.push(("module_id", format!("in.{}", in_list(module_ids))));
    }
    let Some(url) = contact_data.rest_url("course_module_completion_status", &params) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<ModuleIdRow> = response.json().map_err(|_| ())?;
    Ok(rows.into_iter().filter_map(|row| row.module_id).collect())
}

// ---------------------------------------------------------------------------
// Course detail (port of courses.ts::getLearnerCourseDetail) — only the parts
// needed by getRecommendedPracticeItem (module list with completed/locked).
// ---------------------------------------------------------------------------

struct CourseDetailModule {
    id: String,
    completed: bool,
    locked: bool,
}

struct CourseDetail {
    id: String,
    name: Option<String>,
    description: Option<String>,
    modules: Vec<CourseDetailModule>,
}

#[derive(Deserialize)]
struct DetailCourseRow {
    id: Option<String>,
    name: Option<String>,
    description: Option<String>,
}

#[derive(Deserialize)]
struct DetailModuleRow {
    id: Option<String>,
    is_published: Option<bool>,
}

async fn get_learner_course_detail(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_platform_user_id: &str,
    student_workspace_user_id: &str,
    course_id: &str,
) -> Result<Option<CourseDetail>, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if !course_ids.iter().any(|id| id == course_id) {
        return Ok(None);
    }

    // Course row.
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
    let course_rows: Vec<DetailCourseRow> = course_resp.json().map_err(|_| ())?;
    let Some(course) = course_rows.into_iter().next() else {
        return Ok(None);
    };
    let Some(course_id_value) = course.id else {
        return Ok(None);
    };

    // Published modules, ordered by sort_key asc.
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
    let module_rows: Vec<DetailModuleRow> = modules_resp.json().map_err(|_| ())?;

    let module_id_list: Vec<String> = module_rows.iter().filter_map(|m| m.id.clone()).collect();

    let completed_module_ids = fetch_completed_module_ids(
        contact_data,
        outbound,
        student_platform_user_id,
        Some(&module_id_list),
    )
    .await?;

    // Mirror the locked/completed cascade from the legacy code.
    let mut prior_incomplete = false;
    let mut modules = Vec::with_capacity(module_rows.len());
    for module in module_rows {
        let Some(id) = module.id else { continue };
        let is_published = module.is_published.unwrap_or(false);
        let completed = completed_module_ids.contains(&id);
        let locked = !is_published || prior_incomplete;
        if !completed && is_published {
            prior_incomplete = true;
        }
        modules.push(CourseDetailModule {
            id,
            completed,
            locked,
        });
    }

    Ok(Some(CourseDetail {
        id: course_id_value,
        name: course.name,
        description: course.description,
        modules,
    }))
}

// ---------------------------------------------------------------------------
// Recommended practice (port of courses.ts::getRecommendedPracticeItem).
// Note: the legacy code re-derives module `name` from the same query; we fetch
// the module name lazily once a candidate module is chosen.
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
    let courses = fetch_course_summaries(
        contact_data,
        outbound,
        ws_id,
        student_platform_user_id,
        &course_ids,
    )
    .await?;

    for course in &courses {
        let Some(detail) = get_learner_course_detail(
            contact_data,
            outbound,
            ws_id,
            student_platform_user_id,
            student_workspace_user_id,
            &course.id,
        )
        .await?
        else {
            continue;
        };

        // First unlocked + incomplete module, else first unlocked module.
        let chosen = detail
            .modules
            .iter()
            .find(|candidate| !candidate.completed && !candidate.locked)
            .or_else(|| detail.modules.iter().find(|candidate| !candidate.locked));

        if let Some(module) = chosen {
            let module_name =
                fetch_module_name(contact_data, outbound, &detail.id, &module.id).await?;
            return Ok(json!({
                "type": "module",
                "id": module.id,
                "title": module_name,
                "courseId": detail.id,
                "courseName": detail.name,
                "prompt": detail.description,
            }));
        }
    }

    Ok(Value::Null)
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
// Assignments (port of activity.ts::getLearnerAssignments).
// Reads from the `private` PostgREST schema via Accept-Profile.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PostRow {
    id: Option<String>,
    title: Option<String>,
    content: Option<String>,
    created_at: Option<String>,
    group_id: Option<String>,
    workspace_user_groups: Option<Value>,
}

#[derive(Deserialize)]
struct PostCheckRow {
    post_id: Option<String>,
    is_completed: Option<bool>,
    approval_status: Option<String>,
}

async fn get_learner_assignments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    let in_filter = in_list(&course_ids);

    // Posts (private schema).
    let Some(posts_url) = contact_data.rest_url(
        "user_group_posts",
        &[
            (
                "select",
                "id,title,content,created_at,group_id,workspace_user_groups!inner(id,name,ws_id)"
                    .to_owned(),
            ),
            ("group_id", format!("in.{in_filter}")),
            ("workspace_user_groups.ws_id", format!("eq.{ws_id}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "12".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let posts_resp = service_role_get(contact_data, outbound, &posts_url, Some("private")).await?;
    if !(200..300).contains(&posts_resp.status) {
        return Err(());
    }
    let posts: Vec<PostRow> = posts_resp.json().map_err(|_| ())?;

    // Post checks for this workspace user (private schema).
    let Some(checks_url) = contact_data.rest_url(
        "user_group_post_checks",
        &[
            ("select", "post_id,is_completed,approval_status".to_owned()),
            ("user_id", format!("eq.{student_workspace_user_id}")),
        ],
    ) else {
        return Err(());
    };
    let checks_resp =
        service_role_get(contact_data, outbound, &checks_url, Some("private")).await?;
    if !(200..300).contains(&checks_resp.status) {
        return Err(());
    }
    let checks: Vec<PostCheckRow> = checks_resp.json().map_err(|_| ())?;

    let mut checks_by_post: std::collections::HashMap<String, (bool, Option<String>)> =
        std::collections::HashMap::new();
    for check in checks {
        if let Some(post_id) = check.post_id {
            checks_by_post.insert(
                post_id,
                (check.is_completed.unwrap_or(false), check.approval_status),
            );
        }
    }

    let mut out = Vec::with_capacity(posts.len());
    for post in posts {
        let Some(id) = post.id else { continue };
        let course = first_object(post.workspace_user_groups.as_ref());
        let course_name = course
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str);
        let (is_completed, approval_status) =
            checks_by_post.get(&id).cloned().unwrap_or((false, None));

        out.push(json!({
            "id": id,
            "title": post.title,
            "content": post.content,
            "created_at": post.created_at,
            "course": {
                "id": post.group_id,
                "name": course_name,
            },
            "is_completed": is_completed,
            "approval_status": approval_status,
        }));
    }

    Ok(Value::Array(out))
}

// ---------------------------------------------------------------------------
// Marks (port of activity.ts::getLearnerMarks).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MarkRow {
    indicator_id: Option<String>,
    value: Option<f64>,
    created_at: Option<String>,
    user_group_metrics: Option<Value>,
}

async fn get_learner_marks(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        get_assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }
    let in_filter = in_list(&course_ids);

    let select = "indicator_id,value,created_at,user_group_metrics!inner(id,name,unit,group_id,ws_id,workspace_user_groups(id,name))";
    let Some(url) = contact_data.rest_url(
        "user_indicators",
        &[
            ("select", select.to_owned()),
            ("user_id", format!("eq.{student_workspace_user_id}")),
            ("user_group_metrics.ws_id", format!("eq.{ws_id}")),
            ("user_group_metrics.group_id", format!("in.{in_filter}")),
            ("order", "created_at.desc".to_owned()),
            ("limit", "24".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    let rows: Vec<MarkRow> = response.json().map_err(|_| ())?;

    let mut out = Vec::with_capacity(rows.len());
    for mark in rows {
        let metric = first_object(mark.user_group_metrics.as_ref());
        let metric_id = metric
            .and_then(|value| value.get("id"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .or_else(|| mark.indicator_id.clone());
        let metric_name = metric
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str);
        let metric_unit = metric
            .and_then(|value| value.get("unit"))
            .and_then(Value::as_str);

        let course = metric.and_then(|value| first_object(value.get("workspace_user_groups")));
        let course_json = course
            .map(|course| {
                json!({
                    "id": course.get("id").and_then(Value::as_str),
                    "name": course.get("name").and_then(Value::as_str),
                })
            })
            .unwrap_or(Value::Null);

        let indicator_id = mark.indicator_id.clone().unwrap_or_default();
        out.push(json!({
            "id": format!("{indicator_id}:{student_workspace_user_id}"),
            "value": mark.value,
            "created_at": mark.created_at,
            "metric": {
                "id": metric_id,
                "name": metric_name,
                "unit": metric_unit,
            },
            "course": course_json,
        }));
    }

    Ok(Value::Array(out))
}

// ---------------------------------------------------------------------------
// Workspace-id normalization (file-local copy of the helpers that exist
// privately in workspace_habits_access.rs).
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
// REST helpers.
// ---------------------------------------------------------------------------

/// Service-role GET. When `schema` is `Some`, sets `Accept-Profile` so reads
/// target a non-public PostgREST schema (e.g. `private`).
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

/// Caller (RLS) GET using the user's access token.
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
// Small utilities.
// ---------------------------------------------------------------------------

fn student_id_from_url(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok())?;
    url.query_pairs().find_map(|(key, value)| {
        (key == "studentId" && !value.trim().is_empty()).then(|| value.into_owned())
    })
}

/// Renders a PostgREST `in.(...)` list. Wraps each id in double quotes to keep
/// UUIDs/handles safe regardless of content.
fn in_list(ids: &[String]) -> String {
    let inner = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "")))
        .collect::<Vec<_>>()
        .join(",");
    format!("({inner})")
}

/// PostgREST embedded relations come back either as an object or a
/// single-element array. Returns the first object either way.
fn first_object(value: Option<&Value>) -> Option<&Value> {
    match value {
        Some(Value::Object(_)) => value,
        Some(Value::Array(items)) => items.iter().find(|item| item.is_object()),
        _ => None,
    }
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}

/// Milliseconds since the Unix epoch.
fn now_millis() -> i128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i128)
        .unwrap_or(0)
}

/// Current time as an ISO-8601 / RFC-3339 UTC string with millisecond
/// precision (e.g. `2024-01-02T03:04:05.678Z`), matching JS `toISOString()`.
fn now_iso() -> String {
    millis_to_iso(now_millis())
}

/// Parses an ISO-8601 timestamp (the subset Postgres/`toISOString` emit) to
/// epoch milliseconds. Returns None on parse failure (mirrors JS `NaN` guard).
fn parse_iso_millis(value: &str) -> Option<i128> {
    let value = value.trim();
    // Expected forms: YYYY-MM-DDTHH:MM:SS[.fff][Z|+hh:mm].
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return None;
    }
    let year: i64 = value.get(0..4)?.parse().ok()?;
    let month: i64 = value.get(5..7)?.parse().ok()?;
    let day: i64 = value.get(8..10)?.parse().ok()?;
    let hour: i64 = value.get(11..13)?.parse().ok()?;
    let minute: i64 = value.get(14..16)?.parse().ok()?;
    let second: i64 = value.get(17..19)?.parse().ok()?;

    // Fractional seconds (optional).
    let mut idx = 19;
    let mut millis_frac: i64 = 0;
    if bytes.get(idx) == Some(&b'.') {
        idx += 1;
        let frac_start = idx;
        while idx < bytes.len() && bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        let frac = &value[frac_start..idx];
        // Take up to the first 3 digits (milliseconds).
        let mut ms = String::from("000");
        for (i, ch) in frac.chars().take(3).enumerate() {
            ms.replace_range(i..i + 1, &ch.to_string());
        }
        millis_frac = ms.parse().unwrap_or(0);
    }

    // Timezone offset (optional). Postgres/JS emit `Z` (UTC) here; if an offset
    // is present, fold it in.
    let mut offset_minutes: i64 = 0;
    if idx < bytes.len() {
        match bytes[idx] {
            b'Z' | b'z' => {}
            b'+' | b'-' => {
                let sign = if bytes[idx] == b'-' { -1 } else { 1 };
                let oh: i64 = value.get(idx + 1..idx + 3)?.parse().ok()?;
                let om: i64 = value
                    .get(idx + 4..idx + 6)
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                offset_minutes = sign * (oh * 60 + om);
            }
            _ => {}
        }
    }

    let days = days_from_civil(year, month, day);
    let total_seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_minutes * 60;
    Some(total_seconds as i128 * 1_000 + millis_frac as i128)
}

fn millis_to_iso(millis: i128) -> String {
    let total_seconds = millis.div_euclid(1_000) as i64;
    let ms = millis.rem_euclid(1_000) as i64;
    let days = total_seconds.div_euclid(86_400);
    let secs_of_day = total_seconds.rem_euclid(86_400);
    let hour = secs_of_day / 3_600;
    let minute = (secs_of_day % 3_600) / 60;
    let second = secs_of_day % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{ms:03}Z")
}

/// Days from 1970-01-01 to the given civil date (Howard Hinnant's algorithm).
fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of `days_from_civil`.
fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { y + 1 } else { y }, month, day)
}
