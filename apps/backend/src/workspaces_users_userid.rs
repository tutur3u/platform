use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest},
    supabase_auth,
};

const WORKSPACE_USERS_PATH_PREFIX: &str = "/api/workspaces/";
const WORKSPACE_USERS_PATH_INFIX: &str = "/users/";

// PostgREST single-object representation. Mirrors supabase-js `.single()`, which
// requests exactly one row and surfaces an error (non-2xx) when the result set
// is not exactly one row.
const PGRST_SINGLE_OBJECT: &str = "application/vnd.pgrst.object+json";

const FETCH_ERROR_MESSAGE: &str = "Error fetching workspace user";

pub(crate) async fn handle_workspaces_users_userid_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let (ws_id, user_id) = workspace_users_path_segments(request.path)?;

    Some(match request.method {
        "GET" => workspace_user_response(config, request, ws_id, user_id, outbound).await,
        // PUT/DELETE are not migrated yet; return None so the Cloudflare worker
        // falls through to the still-active Next.js route for those methods.
        _ => return None,
    })
}

async fn workspace_user_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirrors the legacy route which uses the caller's RLS-scoped Supabase
    // client:
    //   supabase.from('workspace_users').select('*')
    //     .eq('id', userId).eq('ws_id', wsId).single()
    // On any error (including no row / forbidden by RLS) it returns 500 with
    // { message: 'Error fetching workspace user' }; otherwise it returns the row
    // JSON directly with status 200.
    match fetch_workspace_user(&config.contact_data, request, ws_id, user_id, outbound).await {
        Ok(user) => no_store_response(json_response(200, user)),
        Err(()) => message_response(500, FETCH_ERROR_MESSAGE),
    }
}

async fn fetch_workspace_user(
    contact_data: &contact::ContactDataConfig,
    request: BackendRequest<'_>,
    ws_id: &str,
    user_id: &str,
    outbound: &impl OutboundHttpClient,
) -> Result<Value, ()> {
    // Use the caller's access token so row-level security applies exactly as in
    // the legacy route (which relied on the authenticated user's client). When
    // no token is present, RLS yields no rows and the single-object request
    // fails -> Err(()) -> 500, matching the legacy `.single()` error path.
    let access_token = supabase_auth::request_access_token(request).ok_or(())?;
    let service_role_key = contact_data.service_role_key().ok_or(())?;

    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            ("select", "*".to_owned()),
            ("id", format!("eq.{user_id}")),
            ("ws_id", format!("eq.{ws_id}")),
        ],
    ) else {
        return Err(());
    };

    let authorization = format!("Bearer {access_token}");
    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Get, &url)
                // `application/vnd.pgrst.object+json` makes PostgREST enforce
                // single-object semantics (errors when the result is not exactly
                // one row), reproducing supabase-js `.single()`.
                .with_header("Accept", PGRST_SINGLE_OBJECT)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Value>().map_err(|_| ())
}

fn workspace_users_path_segments(path: &str) -> Option<(&str, &str)> {
    let rest = path.strip_prefix(WORKSPACE_USERS_PATH_PREFIX)?;
    let (ws_id, user_id) = rest.split_once(WORKSPACE_USERS_PATH_INFIX)?;

    // Only handle the base /api/workspaces/:wsId/users/:userId shape. Reject
    // empty or deeper sub-paths (e.g. /users/:userId/groups) so more-specific
    // handlers and the Next.js fallback keep their routes.
    if ws_id.is_empty() || ws_id.contains('/') || user_id.is_empty() || user_id.contains('/') {
        return None;
    }

    Some((ws_id, user_id))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
