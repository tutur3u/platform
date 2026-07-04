use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, json_response,
    no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FETCH_FAILED_MESSAGE: &str = "Error fetching workspace course modules";

/// Handles `GET /api/v1/workspaces/:wsId/courses/:courseId/modules`.
///
/// Returns `None` when the path does not match this route (so the worker can
/// fall through to the still-active Next.js route for unmigrated methods such
/// as POST). Only the migrated GET method produces `Some(...)`.
pub(crate) async fn handle_workspaces_courses_courseid_modules_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    // `course_id` is the `:courseId` segment, which the legacy route maps to
    // the `group_id` filter on `workspace_course_modules`.
    let course_id = course_modules_course_id(request.path)?;

    Some(match request.method {
        "GET" => course_modules_response(config, request, course_id, outbound).await,
        // Only GET is migrated; return None for every other method so the
        // worker falls through to the still-active Next.js route (e.g. POST).
        _ => return None,
    })
}

async fn course_modules_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    course_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    // The legacy route uses `createClient()` (the caller's supabase session)
    // and therefore relies on RLS for authorization. Mirror that by reading the
    // caller's access token and forwarding it on the REST request so RLS
    // applies with the caller's identity.
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Validate the token resolves to a real user (defense in depth; the REST
    // call is still RLS-scoped to this token).
    let Some(_user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    // Mirror the legacy supabase query:
    //   .from('workspace_course_modules')
    //   .select('*')
    //   .eq('group_id', id)
    //   .order('sort_key', { ascending: true, nullsFirst: false })
    //   .order('created_at', { ascending: true });
    let Some(url) = contact_data.rest_url(
        "workspace_course_modules",
        &[
            ("select", "*".to_owned()),
            ("group_id", format!("eq.{course_id}")),
            ("order", "sort_key.asc.nullslast,created_at.asc".to_owned()),
        ],
    ) else {
        return message_response(500, FETCH_FAILED_MESSAGE);
    };

    let service_role_key = match contact_data.service_role_key() {
        Some(key) => key,
        None => return message_response(500, FETCH_FAILED_MESSAGE),
    };
    let authorization = format!("Bearer {access_token}");

    let response = match outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
    {
        Ok(response) => response,
        Err(_) => return message_response(500, FETCH_FAILED_MESSAGE),
    };

    if !(200..300).contains(&response.status) {
        return message_response(500, FETCH_FAILED_MESSAGE);
    }

    // The legacy route returns the raw row array verbatim. Forward the PostgREST
    // JSON array unchanged; default to an empty array on a parse miss.
    let body = response
        .json::<Value>()
        .unwrap_or_else(|_| Value::Array(Vec::new()));

    no_store_response(json_response(200, body))
}

/// Extracts the `:courseId` segment from
/// `/api/v1/workspaces/:wsId/courses/:courseId/modules`, returning `None` when
/// the path shape does not match this route.
fn course_modules_course_id(path: &str) -> Option<&str> {
    let segments = path_segments(path);

    if segments.len() == 7
        && segments[0] == "api"
        && segments[1] == "v1"
        && segments[2] == "workspaces"
        && !segments[3].is_empty()
        && segments[4] == "courses"
        && !segments[5].is_empty()
        && segments[6] == "modules"
    {
        Some(segments[5])
    } else {
        None
    }
}

// File-local copy of `lib.rs::path_segments` (which is a private fn in that
// module). Kept identical so the route-shape matching stays consistent.
fn path_segments(path: &str) -> Vec<&str> {
    path.trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect()
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
