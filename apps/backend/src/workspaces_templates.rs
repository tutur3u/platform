use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const INTERNAL_WORKSPACE_SLUG: &str = "internal";
const PERSONAL_WORKSPACE_SLUG: &str = "personal";
const ROOT_WORKSPACE_ID: &str = "00000000-0000-0000-0000-000000000000";
const STORAGE_BUCKET: &str = "workspaces";
const SIGNED_URL_EXPIRES_IN: u32 = 3600;

const WORKSPACES_TEMPLATES_PATH_PREFIX: &str = "/api/v1/workspaces/";
const WORKSPACES_TEMPLATES_PATH_SUFFIX: &str = "/templates";

const UNAUTHORIZED_MESSAGE: &str = "Please sign in to view templates";
const MEMBERSHIP_LOOKUP_FAILED_MESSAGE: &str = "Failed to verify workspace membership";
const ACCESS_DENIED_MESSAGE: &str = "Access denied to workspace";
const FETCH_FAILED_MESSAGE: &str = "Failed to fetch templates";

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceMembershipRow {
    #[serde(rename = "type")]
    membership_type: Option<String>,
}

#[derive(Deserialize)]
struct BoardTemplateRow {
    id: Option<Value>,
    ws_id: Option<String>,
    created_by: Option<String>,
    source_board_id: Option<Value>,
    name: Option<Value>,
    description: Option<Value>,
    visibility: Option<Value>,
    background_path: Option<String>,
    content: Option<Value>,
    created_at: Option<Value>,
    updated_at: Option<Value>,
}

#[derive(Deserialize)]
struct SignedUrlRow {
    #[serde(rename = "signedURL")]
    signed_url: Option<String>,
}

#[derive(Serialize)]
struct TemplateStats {
    lists: u64,
    tasks: u64,
    labels: u64,
}

#[derive(Serialize)]
struct SerializedTemplate {
    id: Value,
    #[serde(rename = "wsId")]
    ws_id: Value,
    #[serde(rename = "createdBy")]
    created_by: Value,
    #[serde(rename = "sourceBoardId")]
    source_board_id: Value,
    name: Value,
    description: Value,
    visibility: Value,
    #[serde(rename = "backgroundPath")]
    background_path: Value,
    #[serde(rename = "backgroundUrl")]
    background_url: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Value,
    #[serde(rename = "updatedAt")]
    updated_at: Value,
    #[serde(rename = "isOwner")]
    is_owner: bool,
    stats: TemplateStats,
}

pub(crate) async fn handle_workspaces_templates_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    let raw_ws_id = workspaces_templates_ws_id(request.path)?;

    Some(match request.method {
        "GET" => templates_response(config, request, raw_ws_id, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn templates_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    raw_ws_id: &str,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let contact_data = &config.contact_data;

    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };

    let resolved_ws_id =
        match normalize_workspace_id(contact_data, outbound, raw_ws_id, &user_id, &access_token)
            .await
        {
            Ok(ws_id) => ws_id,
            Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
        };

    match verify_workspace_member(contact_data, outbound, &resolved_ws_id, &user_id).await {
        Ok(true) => {}
        Ok(false) => return message_response(403, ACCESS_DENIED_MESSAGE),
        Err(()) => return message_response(500, MEMBERSHIP_LOOKUP_FAILED_MESSAGE),
    }

    let templates =
        match fetch_board_templates(contact_data, outbound, &resolved_ws_id, &user_id).await {
            Ok(rows) => rows,
            Err(()) => return message_response(500, FETCH_FAILED_MESSAGE),
        };

    let mut serialized = Vec::with_capacity(templates.len());
    for template in templates {
        let background_path = template.background_path.clone();
        let background_url = match background_path
            .as_deref()
            .filter(|path| !path.trim().is_empty())
        {
            Some(path) => create_signed_url(contact_data, outbound, path).await,
            None => None,
        };

        let is_owner = template.created_by.as_deref() == Some(user_id.as_str());
        let stats = compute_stats(template.content.as_ref());

        serialized.push(SerializedTemplate {
            id: template.id.unwrap_or(Value::Null),
            ws_id: template.ws_id.map(Value::String).unwrap_or(Value::Null),
            created_by: template
                .created_by
                .map(Value::String)
                .unwrap_or(Value::Null),
            source_board_id: template.source_board_id.unwrap_or(Value::Null),
            name: template.name.unwrap_or(Value::Null),
            description: template.description.unwrap_or(Value::Null),
            visibility: template.visibility.unwrap_or(Value::Null),
            background_path: background_path.map(Value::String).unwrap_or(Value::Null),
            background_url,
            created_at: template.created_at.unwrap_or(Value::Null),
            updated_at: template.updated_at.unwrap_or(Value::Null),
            is_owner,
            stats,
        });
    }

    no_store_response(json_response(200, json!({ "templates": serialized })))
}

fn compute_stats(content: Option<&Value>) -> TemplateStats {
    let Some(Value::Object(map)) = content else {
        return TemplateStats {
            lists: 0,
            tasks: 0,
            labels: 0,
        };
    };

    let lists_array = map.get("lists").and_then(Value::as_array);
    let lists = lists_array.map(|lists| lists.len() as u64).unwrap_or(0);
    let tasks = lists_array
        .map(|lists| {
            lists
                .iter()
                .map(|list| {
                    list.get("tasks")
                        .and_then(Value::as_array)
                        .map(|tasks| tasks.len() as u64)
                        .unwrap_or(0)
                })
                .sum()
        })
        .unwrap_or(0);
    let labels = map
        .get("labels")
        .and_then(Value::as_array)
        .map(|labels| labels.len() as u64)
        .unwrap_or(0);

    TemplateStats {
        lists,
        tasks,
        labels,
    }
}

async fn fetch_board_templates(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<Vec<BoardTemplateRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "board_templates",
        &[
            (
                "select",
                "id,ws_id,created_by,source_board_id,name,description,visibility,background_path,content,created_at,updated_at"
                    .to_owned(),
            ),
            ("ws_id", format!("eq.{ws_id}")),
            (
                "or",
                format!("(visibility.neq.private,created_by.eq.{user_id})"),
            ),
            ("order", "created_at.desc".to_owned()),
        ],
    ) else {
        return Err(());
    };

    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        return Err(());
    }

    response.json::<Vec<BoardTemplateRow>>().map_err(|_| ())
}

/// Create a signed Storage URL via `POST <origin>/storage/v1/object/sign/<bucket>/<path>`
/// with `{ "expiresIn": 3600 }`, mirroring the Supabase JS storage client. Returns the
/// fully-qualified `signedUrl`, or `None` when signing fails or no URL is returned (the
/// legacy route falls back to `null` in that case).
async fn create_signed_url(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    storage_path: &str,
) -> Option<String> {
    let storage_base = storage_origin(contact_data)?;
    let service_role_key = contact_data.service_role_key()?;
    let authorization = format!("Bearer {service_role_key}");
    let url = format!("{storage_base}/object/sign/{STORAGE_BUCKET}/{storage_path}");
    let body = json!({ "expiresIn": SIGNED_URL_EXPIRES_IN }).to_string();

    let response = outbound
        .send(
            OutboundRequest::new(OutboundMethod::Post, &url)
                .with_header("Accept", APPLICATION_JSON)
                .with_header("Content-Type", APPLICATION_JSON)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key)
                .with_body(&body),
        )
        .await
        .ok()?;

    if !(200..300).contains(&response.status) {
        return None;
    }

    let signed = response.json::<SignedUrlRow>().ok()?.signed_url?;
    if signed.trim().is_empty() {
        return None;
    }

    Some(format!("{storage_base}{signed}"))
}

/// Derive the Supabase Storage base (`<origin>/storage/v1`) from the REST base
/// URL. `ContactDataConfig` exposes no raw origin accessor, so reuse `rest_url`
/// and rewrite the `/rest/v1/...` segment to `/storage/v1`.
fn storage_origin(contact_data: &contact::ContactDataConfig) -> Option<String> {
    let rest_url = contact_data.rest_url("__origin__", &[])?;
    let origin = rest_url.split("/rest/v1/").next()?;
    if origin.is_empty() {
        return None;
    }
    Some(format!("{origin}/storage/v1"))
}

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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

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
    let response = send_caller_get(contact_data, outbound, &url, access_token).await?;

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
    let response = send_service_role_get(contact_data, outbound, &url).await?;

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

async fn verify_workspace_member(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ws_id: &str,
    user_id: &str,
) -> Result<bool, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_members",
        &[
            ("select", "type".to_owned()),
            ("ws_id", format!("eq.{ws_id}")),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;

    if !(200..300).contains(&response.status) {
        return Err(());
    }

    Ok(response
        .json::<Vec<WorkspaceMembershipRow>>()
        .map_err(|_| ())?
        .first()
        .and_then(|row| row.membership_type.as_deref())
        == Some("MEMBER"))
}

async fn send_caller_get(
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

async fn send_service_role_get(
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

fn workspaces_templates_ws_id(path: &str) -> Option<&str> {
    let ws_id = path
        .strip_prefix(WORKSPACES_TEMPLATES_PATH_PREFIX)?
        .strip_suffix(WORKSPACES_TEMPLATES_PATH_SUFFIX)?;

    (!ws_id.is_empty() && !ws_id.contains('/')).then_some(ws_id)
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

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
