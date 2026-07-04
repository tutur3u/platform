use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact, json_response,
    method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
    supabase_auth,
};

const TULEARN_BOOTSTRAP_PATH: &str = "/api/v1/tulearn/bootstrap";
const ENABLE_EDUCATION_SECRET: &str = "ENABLE_EDUCATION";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FAILED_MESSAGE: &str = "Failed to load Tulearn";

// ---------------------------------------------------------------------------
// Response shapes (must match the legacy JSON response from getTulearnBootstrap)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct BootstrapResponse {
    profile: ProfileSummary,
    workspaces: Vec<WorkspaceSummary>,
    #[serde(rename = "linkedStudents")]
    linked_students: Vec<StudentSummary>,
}

#[derive(Serialize)]
struct ProfileSummary {
    id: String,
    email: Option<String>,
    display_name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Serialize)]
struct WorkspaceSummary {
    id: String,
    name: Option<String>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    roles: Vec<&'static str>,
}

#[derive(Serialize)]
struct StudentSummary {
    id: String,
    platform_user_id: String,
    workspace_user_id: String,
    workspace_id: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

// ---------------------------------------------------------------------------
// Supabase row shapes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
}

#[derive(Deserialize)]
struct LinkedUserRow {
    ws_id: Option<String>,
}

#[derive(Deserialize)]
struct ParentLinkRow {
    ws_id: Option<String>,
    student_platform_user_id: Option<String>,
    student_workspace_user_id: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceUserRow {
    id: Option<String>,
    full_name: Option<String>,
    display_name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct UserProfileRow {
    display_name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct UserPrivateDetailsRow {
    email: Option<String>,
    full_name: Option<String>,
}

// Internal aggregation entry mirroring TulearnWorkspaceSummary.
struct WorkspaceEntry {
    id: String,
    name: Option<String>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    roles: Vec<&'static str>,
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_tulearn_bootstrap_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != TULEARN_BOOTSTRAP_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => tulearn_bootstrap_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn tulearn_bootstrap_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Legacy route uses withSessionAuth({ allowAppSessionAuth: true }), so app
    // session bearer tokens are accepted in addition to supabase sessions.
    let Some(access_token) = supabase_auth::request_access_token_allowing_app_sessions(request)
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(auth_user) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
    else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) = auth_user.id.filter(|id| !id.trim().is_empty()) else {
        return message_response(401, UNAUTHORIZED_MESSAGE);
    };
    let user_email = auth_user.email;

    match build_bootstrap(
        &config.contact_data,
        outbound,
        &user_id,
        user_email.as_deref(),
        &access_token,
    )
    .await
    {
        Ok(response) => no_store_response(json_response(200, response)),
        Err(()) => message_response(500, FAILED_MESSAGE),
    }
}

async fn build_bootstrap(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    user_email: Option<&str>,
    access_token: &str,
) -> Result<BootstrapResponse, ()> {
    // --- Service-role reads (mirror sbAdmin) ---------------------------------
    let membership_workspaces =
        fetch_membership_workspaces(contact_data, outbound, user_id).await?;
    let linked_users = fetch_linked_users(contact_data, outbound, user_id).await?;
    let parent_links = fetch_parent_links(contact_data, outbound, user_id).await?;

    // --- Caller-token (RLS) reads (mirror requestSupabase) -------------------
    let profile = fetch_user_profile(contact_data, outbound, user_id, access_token).await?;
    let private_details =
        fetch_user_private_details(contact_data, outbound, user_id, access_token).await?;

    // --- Aggregate workspaces -----------------------------------------------
    // Preserve insertion order so we can sort deterministically later, while
    // also allowing existence checks / role merges by id.
    let mut workspace_map: BTreeMap<String, WorkspaceEntry> = BTreeMap::new();

    for workspace in membership_workspaces {
        if let Some(id) = workspace.id {
            workspace_map.entry(id.clone()).or_insert(WorkspaceEntry {
                id,
                name: workspace.name,
                avatar_url: workspace.avatar_url,
                logo_url: workspace.logo_url,
                roles: vec!["student"],
            });
        }
    }

    // Linked (student) workspaces — only those with education enabled.
    let linked_workspace_ids = dedup(linked_users.into_iter().filter_map(|row| row.ws_id));
    if !linked_workspace_ids.is_empty() {
        let linked_workspaces = fetch_workspaces_by_ids_education_enabled(
            contact_data,
            outbound,
            &linked_workspace_ids,
        )
        .await?;
        for workspace in linked_workspaces {
            let Some(id) = workspace.id else { continue };
            match workspace_map.get_mut(&id) {
                Some(existing) => {
                    if !existing.roles.contains(&"student") {
                        existing.roles.push("student");
                    }
                }
                None => {
                    workspace_map.insert(
                        id.clone(),
                        WorkspaceEntry {
                            id,
                            name: workspace.name,
                            avatar_url: workspace.avatar_url,
                            logo_url: workspace.logo_url,
                            roles: vec!["student"],
                        },
                    );
                }
            }
        }
    }

    // Parent workspaces + linked students.
    let parent_workspace_ids = dedup(parent_links.iter().filter_map(|link| link.ws_id.clone()));
    let student_workspace_user_ids = dedup(
        parent_links
            .iter()
            .filter_map(|link| link.student_workspace_user_id.clone()),
    );

    let parent_workspaces = if parent_workspace_ids.is_empty() {
        Vec::new()
    } else {
        fetch_workspaces_by_ids_education_enabled(contact_data, outbound, &parent_workspace_ids)
            .await?
    };
    let parent_students = if student_workspace_user_ids.is_empty() {
        Vec::new()
    } else {
        fetch_workspace_users_by_ids(contact_data, outbound, &student_workspace_user_ids).await?
    };

    for workspace in parent_workspaces {
        let Some(id) = workspace.id else { continue };
        match workspace_map.get_mut(&id) {
            Some(existing) => {
                if !existing.roles.contains(&"parent") {
                    existing.roles.push("parent");
                }
            }
            None => {
                workspace_map.insert(
                    id.clone(),
                    WorkspaceEntry {
                        id,
                        name: workspace.name,
                        avatar_url: workspace.avatar_url,
                        logo_url: workspace.logo_url,
                        roles: vec!["parent"],
                    },
                );
            }
        }
    }

    let students_by_workspace_user_id: BTreeMap<String, WorkspaceUserRow> = parent_students
        .into_iter()
        .filter_map(|student| student.id.clone().map(|id| (id, student)))
        .collect();

    // --- Build linkedStudents (preserve parent_links order) ------------------
    let mut linked_students: Vec<StudentSummary> = Vec::new();
    for link in &parent_links {
        let (Some(ws_id), Some(student_wu_id), Some(student_platform_user_id)) = (
            link.ws_id.clone(),
            link.student_workspace_user_id.clone(),
            link.student_platform_user_id.clone(),
        ) else {
            continue;
        };
        let Some(student) = students_by_workspace_user_id.get(&student_wu_id) else {
            continue;
        };
        if !workspace_map.contains_key(&ws_id) {
            continue;
        }
        linked_students.push(StudentSummary {
            id: student_wu_id.clone(),
            platform_user_id: student_platform_user_id,
            workspace_user_id: student_wu_id,
            workspace_id: ws_id,
            name: to_display_name(
                student.display_name.as_deref(),
                student.full_name.as_deref(),
                student.email.as_deref(),
            ),
            email: student.email.clone(),
            avatar_url: student.avatar_url.clone(),
        });
    }

    // --- Sort workspaces by name (localeCompare ~ ascending string compare) --
    let mut workspaces: Vec<WorkspaceSummary> = workspace_map
        .into_values()
        .map(|entry| WorkspaceSummary {
            id: entry.id,
            name: entry.name,
            avatar_url: entry.avatar_url,
            logo_url: entry.logo_url,
            roles: entry.roles,
        })
        .collect();
    workspaces.sort_by(|a, b| {
        a.name
            .as_deref()
            .unwrap_or("")
            .cmp(b.name.as_deref().unwrap_or(""))
    });

    // --- Profile -------------------------------------------------------------
    let profile_email = private_details
        .as_ref()
        .and_then(|details| details.email.clone())
        .or_else(|| user_email.map(str::to_owned));
    let profile_display_name = profile
        .as_ref()
        .and_then(|profile| profile.display_name.clone())
        .or_else(|| {
            private_details
                .as_ref()
                .and_then(|details| details.full_name.clone())
        })
        .or_else(|| user_email.map(str::to_owned));
    let profile_avatar_url = profile
        .as_ref()
        .and_then(|profile| profile.avatar_url.clone());

    Ok(BootstrapResponse {
        profile: ProfileSummary {
            id: user_id.to_owned(),
            email: profile_email,
            display_name: profile_display_name,
            avatar_url: profile_avatar_url,
        },
        workspaces,
        linked_students,
    })
}

// ---------------------------------------------------------------------------
// Supabase fetch helpers
// ---------------------------------------------------------------------------

async fn fetch_membership_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id, name, avatar_url, logo_url, workspace_members!inner(user_id), workspace_secrets!inner(name, value)"
                    .to_owned(),
            ),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            (
                "workspace_secrets.name",
                format!("eq.{ENABLE_EDUCATION_SECRET}"),
            ),
            ("workspace_secrets.value", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    json_rows(send_service_role_rest_request(contact_data, outbound, &url).await?)
}

async fn fetch_linked_users(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<LinkedUserRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_user_linked_users",
        &[
            ("select", "ws_id, virtual_user_id".to_owned()),
            ("platform_user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    json_rows(send_service_role_rest_request(contact_data, outbound, &url).await?)
}

async fn fetch_parent_links(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<ParentLinkRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "tulearn_parent_student_links",
        &[
            (
                "select",
                "ws_id, student_platform_user_id, student_workspace_user_id".to_owned(),
            ),
            ("parent_user_id", format!("eq.{user_id}")),
            ("status", "eq.active".to_owned()),
        ],
    ) else {
        return Err(());
    };
    json_rows(send_service_role_rest_request(contact_data, outbound, &url).await?)
}

async fn fetch_workspaces_by_ids_education_enabled(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ids: &[String],
) -> Result<Vec<WorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id, name, avatar_url, logo_url, workspace_secrets!inner(name, value)".to_owned(),
            ),
            ("id", in_filter(ids)),
            (
                "workspace_secrets.name",
                format!("eq.{ENABLE_EDUCATION_SECRET}"),
            ),
            ("workspace_secrets.value", "eq.true".to_owned()),
        ],
    ) else {
        return Err(());
    };
    json_rows(send_service_role_rest_request(contact_data, outbound, &url).await?)
}

async fn fetch_workspace_users_by_ids(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    ids: &[String],
) -> Result<Vec<WorkspaceUserRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspace_users",
        &[
            (
                "select",
                "id, ws_id, full_name, display_name, email, avatar_url".to_owned(),
            ),
            ("id", in_filter(ids)),
        ],
    ) else {
        return Err(());
    };
    json_rows(send_service_role_rest_request(contact_data, outbound, &url).await?)
}

async fn fetch_user_profile(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<UserProfileRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "users",
        &[
            ("select", "id, display_name, avatar_url".to_owned()),
            ("id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    Ok(json_rows::<UserProfileRow>(
        send_caller_rest_request(contact_data, outbound, &url, access_token).await?,
    )?
    .into_iter()
    .next())
}

async fn fetch_user_private_details(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    access_token: &str,
) -> Result<Option<UserPrivateDetailsRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "user_private_details",
        &[
            ("select", "email, full_name".to_owned()),
            ("user_id", format!("eq.{user_id}")),
            ("limit", "1".to_owned()),
        ],
    ) else {
        return Err(());
    };
    Ok(json_rows::<UserPrivateDetailsRow>(
        send_caller_rest_request(contact_data, outbound, &url, access_token).await?,
    )?
    .into_iter()
    .next())
}

// ---------------------------------------------------------------------------
// REST request helpers (copied locally from workspace_habits_access.rs patterns;
// those are private to that module, so duplicate them here to stay self-contained)
// ---------------------------------------------------------------------------

async fn send_caller_rest_request(
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

async fn send_service_role_rest_request(
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

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

fn json_rows<T: for<'de> Deserialize<'de>>(response: OutboundResponse) -> Result<Vec<T>, ()> {
    if !(200..300).contains(&response.status) {
        return Err(());
    }
    response.json::<Vec<T>>().map_err(|_| ())
}

/// Build a PostgREST `in.(...)` filter value. `rest_url` URL-encodes the value,
/// so we pass the raw `in.(a,b,c)` form here.
fn in_filter(ids: &[String]) -> String {
    let joined = ids
        .iter()
        .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    format!("in.({joined})")
}

fn dedup(values: impl Iterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut out = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            out.push(value);
        }
    }
    out
}

fn to_display_name(
    display_name: Option<&str>,
    full_name: Option<&str>,
    email: Option<&str>,
) -> Option<String> {
    // Mirror toDisplayName: display_name || full_name || email || null
    // (treat empty strings as falsy, matching JS `||`).
    [display_name, full_name, email]
        .into_iter()
        .flatten()
        .find(|value| !value.is_empty())
        .map(str::to_owned)
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "message": message })))
}
