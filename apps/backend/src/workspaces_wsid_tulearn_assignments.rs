//! Handler for `GET /api/v1/workspaces/:wsId/tulearn/assignments`.
//!
//! Ported from
//! `apps/web/src/app/api/v1/workspaces/[wsId]/tulearn/assignments/route.ts`
//! and the supporting helpers in `@/lib/tulearn/{access,activity,courses}.ts`.
//!
//! The GET handler:
//!
//! - Authenticates the caller (session token or app-session token, mirroring
//!   `allowAppSessionAuth: true` in the legacy route).
//! - Resolves the "subject" learner via `resolveTulearnSubject` (either the
//!   caller themselves as a student, or a learner the caller is a parent of via
//!   `tulearn_parent_student_links`).
//! - Calls `getLearnerAssignments` which reads from the `private` PostgREST
//!   schema (`user_group_posts` joined with their completion status in
//!   `user_group_post_checks`) and returns the result as `{ assignments: [...] }`.
//!
//! The PATCH method is NOT ported here (it performs a write mutation with XP
//! award logic); returning `None` lets the request fall through to the still-live
//! Next.js PATCH handler.
//!
//! Behavior gap: `resolveTulearnSubject` in the legacy route can also look up the
//! student via a caller-token-scoped Supabase query; this port uses a
//! service-role read for `workspace_user_linked_users`, which is equivalent in
//! practice (the row is scoped by `ws_id` and `platform_user_id`).

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const PATH_PREFIX: &str = "/api/v1/workspaces/";
const PATH_SUFFIX: &str = "/tulearn/assignments";

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const NOT_ENABLED_MESSAGE: &str = "Tulearn is not enabled for this workspace";
const NO_LEARNER_ACCESS_MESSAGE: &str = "You don't have access to this learner";
const LOAD_FAILED_MESSAGE: &str = "Failed to load assignments";

const ASSIGNMENTS_LIMIT: &str = "12";

// ---------------------------------------------------------------------------
// Data transfer types
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
    student_workspace_user_id: Option<String>,
}

#[derive(Deserialize)]
struct AssignedCourseRow {
    group_id: Option<String>,
}

#[derive(Deserialize)]
struct PostRow {
    id: Option<String>,
    title: Option<String>,
    content: Option<String>,
    created_at: Option<String>,
    group_id: Option<String>,
    /// Embedded join with `workspace_user_groups`. PostgREST may return this as
    /// an object or a single-element array depending on the relationship
    /// cardinality; handled via `first_object`.
    workspace_user_groups: Option<Value>,
}

#[derive(Deserialize)]
struct PostCheckRow {
    post_id: Option<String>,
    is_completed: Option<bool>,
    approval_status: Option<String>,
}

// ---------------------------------------------------------------------------
// Internal subject type
// ---------------------------------------------------------------------------

struct TulearnSubject {
    ws_id: String,
    student_workspace_user_id: String,
}

enum SubjectOutcome {
    Subject(TulearnSubject),
    NotEnabled,
    NoLearnerAccess,
}

// ---------------------------------------------------------------------------
// Public handler
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_wsid_tulearn_assignments_route(
    config: &crate::BackendConfig,
    request: crate::BackendRequest<'_>,
    outbound: &impl crate::outbound::OutboundHttpClient,
) -> Option<crate::BackendResponse> {
    let raw_ws_id = ws_id_from_path(request.path)?;

    Some(match request.method {
        "GET" => assignments_response(config, request, raw_ws_id, outbound).await,
        _ => return None,
    })
}

// ---------------------------------------------------------------------------
// GET implementation
// ---------------------------------------------------------------------------

async fn assignments_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // Authenticate: the legacy route enables allowAppSessionAuth.
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

    match learner_assignments(
        contact_data,
        outbound,
        &subject.ws_id,
        &subject.student_workspace_user_id,
    )
    .await
    {
        Ok(assignments) => {
            no_store_response(json_response(200, json!({ "assignments": assignments })))
        }
        Err(()) => message_response(500, LOAD_FAILED_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Subject resolution (mirrors resolveTulearnSubject)
// ---------------------------------------------------------------------------

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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    Ok(response
        .json::<Vec<ParentLinkRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

// ---------------------------------------------------------------------------
// Assignments fetch (mirrors getLearnerAssignments in activity.ts)
// ---------------------------------------------------------------------------

async fn learner_assignments(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    student_workspace_user_id: &str,
) -> Result<Value, ()> {
    let course_ids =
        assigned_course_ids(contact_data, outbound, ws_id, student_workspace_user_id).await?;
    if course_ids.is_empty() {
        return Ok(Value::Array(Vec::new()));
    }

    let in_filter = in_list(&course_ids);

    // Posts from the `private` PostgREST schema.
    let posts_url = contact_data
        .rest_url(
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
                ("limit", ASSIGNMENTS_LIMIT.to_owned()),
            ],
        )
        .ok_or(())?;
    let posts_resp = service_role_get(contact_data, outbound, &posts_url, Some("private")).await?;
    if !(200..300).contains(&posts_resp.status) {
        return Err(());
    }
    let posts: Vec<PostRow> = posts_resp.json().map_err(|_| ())?;

    // Completion checks from the `private` schema.
    let checks_url = contact_data
        .rest_url(
            "user_group_post_checks",
            &[
                ("select", "post_id,is_completed,approval_status".to_owned()),
                ("user_id", format!("eq.{student_workspace_user_id}")),
            ],
        )
        .ok_or(())?;
    let checks_resp =
        service_role_get(contact_data, outbound, &checks_url, Some("private")).await?;
    if !(200..300).contains(&checks_resp.status) {
        return Err(());
    }
    let checks: Vec<PostCheckRow> = checks_resp.json().map_err(|_| ())?;

    // Index checks by post id.
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

    let mut out: Vec<Value> = Vec::with_capacity(posts.len());
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

async fn assigned_course_ids(
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
    let response = service_role_get(contact_data, outbound, &url, None).await?;
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
// Workspace id normalization
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
        if is_direct_workspace_lookup_identifier(&handle) {
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
// HTTP helpers
// ---------------------------------------------------------------------------

/// Service-role GET. When `schema` is `Some`, sets `Accept-Profile` to
/// target a non-public PostgREST schema (e.g. `"private"`).
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

/// Caller-token GET (RLS active), using the user's access token.
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
// Path and URL helpers
// ---------------------------------------------------------------------------

fn ws_id_from_path(path: &str) -> Option<&str> {
    let ws_id = path.strip_prefix(PATH_PREFIX)?.strip_suffix(PATH_SUFFIX)?;
    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
}

fn student_id_param(request_url: Option<&str>) -> Option<String> {
    let url = request_url.and_then(|url| url::Url::parse(url).ok())?;
    url.query_pairs().find_map(|(key, value)| {
        (key == "studentId" && !value.trim().is_empty()).then(|| value.into_owned())
    })
}

/// Builds a PostgREST `in.(...)` filter value.
fn in_list(ids: &[String]) -> String {
    let inner = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "")))
        .collect::<Vec<_>>()
        .join(",");
    format!("({inner})")
}

/// PostgREST embedded relations come back as an object or a single-element
/// array; returns the first object either way.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // Path guard: matching paths.
    #[test]
    fn path_matches_valid_uuid() {
        let ws_id = ws_id_from_path(
            "/api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000/tulearn/assignments",
        );
        assert_eq!(ws_id, Some("550e8400-e29b-41d4-a716-446655440000"));
    }

    #[test]
    fn path_matches_handle() {
        let ws_id = ws_id_from_path("/api/v1/workspaces/my-school/tulearn/assignments");
        assert_eq!(ws_id, Some("my-school"));
    }

    // Path guard: non-matching paths return None.
    #[test]
    fn path_wrong_suffix_returns_none() {
        assert!(ws_id_from_path("/api/v1/workspaces/abc/tulearn/home").is_none());
    }

    #[test]
    fn path_extra_segment_returns_none() {
        assert!(ws_id_from_path("/api/v1/workspaces/abc/tulearn/assignments/extra").is_none());
    }

    #[test]
    fn path_empty_ws_id_returns_none() {
        assert!(ws_id_from_path("/api/v1/workspaces//tulearn/assignments").is_none());
    }

    // `in_list` formatting.
    #[test]
    fn in_list_single() {
        assert_eq!(in_list(&["abc".to_owned()]), "(\"abc\")");
    }

    #[test]
    fn in_list_multiple() {
        assert_eq!(in_list(&["a".to_owned(), "b".to_owned()]), "(\"a\",\"b\")");
    }

    #[test]
    fn in_list_empty() {
        assert_eq!(in_list(&[]), "()");
    }

    // Workspace id helpers.
    #[test]
    fn uuid_literal_recognised() {
        assert!(is_workspace_uuid_literal(
            "550e8400-e29b-41d4-a716-446655440000"
        ));
    }

    #[test]
    fn short_string_not_uuid() {
        assert!(!is_workspace_uuid_literal("short"));
    }

    #[test]
    fn handle_valid() {
        assert!(is_workspace_handle("my-school"));
        assert!(is_workspace_handle("abc123"));
    }

    #[test]
    fn handle_leading_hyphen_invalid() {
        assert!(!is_workspace_handle("-invalid"));
    }

    #[test]
    fn handle_empty_invalid() {
        assert!(!is_workspace_handle(""));
    }

    // `first_object` helper.
    #[test]
    fn first_object_from_plain_object() {
        let val = serde_json::json!({"id": "x"});
        assert!(first_object(Some(&val)).is_some());
    }

    #[test]
    fn first_object_from_array() {
        let val = serde_json::json!([{"id": "x"}, {"id": "y"}]);
        assert_eq!(
            first_object(Some(&val))
                .and_then(|v| v.get("id"))
                .and_then(Value::as_str),
            Some("x")
        );
    }

    #[test]
    fn first_object_from_null() {
        assert!(first_object(None).is_none());
    }

    // `student_id_param` extraction.
    #[test]
    fn student_id_extracted() {
        let result = student_id_param(Some(
            "https://example.com/api/v1/something?studentId=ws-user-abc",
        ));
        assert_eq!(result, Some("ws-user-abc".to_owned()));
    }

    #[test]
    fn student_id_missing_returns_none() {
        let result = student_id_param(Some("https://example.com/api/v1/something"));
        assert!(result.is_none());
    }

    #[test]
    fn student_id_blank_returns_none() {
        let result = student_id_param(Some("https://example.com/api/v1/something?studentId=   "));
        assert!(result.is_none());
    }
}
