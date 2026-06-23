use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    APPLICATION_JSON, BackendConfig, BackendRequest, BackendResponse, contact,
    hive_access::{self, HiveAccess},
    json_response, method_not_allowed, no_store_response,
    outbound::{OutboundHttpClient, OutboundMethod, OutboundRequest, OutboundResponse},
};

const HIVE_WORKSPACES_PATH: &str = "/api/v1/hive/workspaces";
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const FAILED_TO_RESOLVE_ACCESS_MESSAGE: &str = "Failed to resolve Hive access";
const HIVE_ACCESS_REQUIRED_MESSAGE: &str = "Hive access required";
const FAILED_TO_LIST_MESSAGE: &str = "Failed to list Hive workspaces";
const MEMBER_TYPE: &str = "MEMBER";
const ACTIVE_STATUS: &str = "active";
const PRIVATE_SCHEMA: &str = "private";

pub(crate) async fn handle_hive_workspaces_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != HIVE_WORKSPACES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => hive_workspaces_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn hive_workspaces_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    // Mirror requireHiveAccess: resolve the caller, resolve Hive access, and
    // require member-or-admin before listing workspaces.
    let user = match hive_access::authenticated_user(
        config,
        request,
        contact::current_user_app_session_targets(),
        outbound,
    )
    .await
    {
        Ok(user) => user,
        Err(()) => return message_response(401, UNAUTHORIZED_MESSAGE),
    };

    let access: HiveAccess =
        match hive_access::resolve_hive_access(&config.contact_data, &user.id, outbound).await {
            Ok(access) => access,
            Err(()) => return message_response(500, FAILED_TO_RESOLVE_ACCESS_MESSAGE),
        };

    if !access.has_access() {
        return message_response(403, HIVE_ACCESS_REQUIRED_MESSAGE);
    }

    let workspaces = match fetch_workspace_summaries(&config.contact_data, outbound, &user.id).await
    {
        Ok(workspaces) => workspaces,
        Err(()) => return message_response(500, FAILED_TO_LIST_MESSAGE),
    };

    // getHivePersonalWorkspaceId(...).catch(() => null): swallow failures.
    let personal_workspace_id = personal_workspace_id(&config.contact_data, outbound, &user.id)
        .await
        .ok()
        .flatten();

    success_response(personal_workspace_id, workspaces)
}

// --- Data model -------------------------------------------------------------

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    created_at: Option<String>,
    status: Option<String>,
    product_id: Option<String>,
}

#[derive(Deserialize)]
struct MemberWorkspaceRow {
    id: String,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    creator_id: Option<String>,
    #[serde(default)]
    workspace_subscriptions: Vec<WorkspaceSubscriptionRow>,
}

#[derive(Deserialize)]
struct UserProfileRow {
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct UserPrivateDetailsRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceIdRow {
    id: Option<String>,
}

#[derive(Deserialize)]
struct ProductTierRow {
    id: String,
    tier: Option<String>,
}

// Guest share rows (task_board_shares with nested joins). PostgREST can return
// the embedded relations as either a single object or an array, so all nested
// values are decoded leniently via serde_json::Value below.
#[derive(Deserialize)]
struct GuestShareRow {
    board_id: Option<String>,
    permission: Option<String>,
    workspace_boards: Option<Value>,
}

struct GuestWorkspace {
    summary: Value,
    guest_board_ids: HashSet<String>,
    guest_highest_permission: Option<String>,
}

// --- Core fetch (port of fetchWorkspaceSummaries) ---------------------------

async fn fetch_workspace_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<Value>, ()> {
    let workspaces = member_workspaces(contact_data, outbound, user_id).await?;

    let (public_profile, private_details) = profile_details(contact_data, outbound, user_id).await;

    let display_label = public_profile
        .as_ref()
        .and_then(|profile| non_empty(profile.display_name.clone()))
        .or_else(|| {
            public_profile
                .as_ref()
                .and_then(|p| non_empty(p.handle.clone()))
        })
        .or_else(|| {
            private_details
                .as_ref()
                .and_then(|d| non_empty(d.email.clone()))
        });
    let user_avatar_url = public_profile
        .as_ref()
        .and_then(|profile| non_empty(profile.avatar_url.clone()));

    let member_workspace_ids: HashSet<String> = workspaces
        .iter()
        .map(|workspace| workspace.id.clone())
        .collect();

    // Guest shares: by user id, and by normalized private email.
    let mut guest_share_rows: Vec<GuestShareRow> = Vec::new();
    if let Ok(rows) = guest_shares_by_user(contact_data, outbound, user_id).await {
        guest_share_rows.extend(rows);
    }
    let normalized_email = private_details
        .as_ref()
        .and_then(|details| normalize_share_email(details.email.as_deref()));
    if let Some(email) = normalized_email.as_deref() {
        if let Ok(rows) = guest_shares_by_email(contact_data, outbound, email).await {
            guest_share_rows.extend(rows);
        }
    }

    // Collect subscription product ids from member + guest workspaces.
    let mut subscription_product_ids: HashSet<String> = HashSet::new();
    for workspace in &workspaces {
        collect_subscription_product_ids(
            &workspace.workspace_subscriptions,
            &mut subscription_product_ids,
        );
    }
    for share in &guest_share_rows {
        if let Some(workspace) = guest_share_workspace(share) {
            collect_subscription_product_ids_value(workspace, &mut subscription_product_ids);
        }
    }
    let product_tiers_by_id = fetch_subscription_product_tier_map(
        contact_data,
        outbound,
        &subscription_product_ids.iter().cloned().collect::<Vec<_>>(),
    )
    .await;

    // Build guest workspace summaries.
    let mut guest_workspace_by_id: HashMap<String, GuestWorkspace> = HashMap::new();
    for share in &guest_share_rows {
        let workspace = guest_share_workspace(share);
        let workspace_id = workspace
            .and_then(|workspace| value_str(workspace, "id"))
            .or_else(|| {
                share
                    .workspace_boards
                    .as_ref()
                    .and_then(first_object)
                    .and_then(|board| value_str(board, "ws_id"))
            });
        let board_id = share.board_id.clone().or_else(|| {
            share
                .workspace_boards
                .as_ref()
                .and_then(first_object)
                .and_then(|board| value_str(board, "id"))
        });

        let (Some(workspace_id), Some(board_id), Some(permission)) =
            (workspace_id, board_id, share.permission.clone())
        else {
            continue;
        };
        if member_workspace_ids.contains(&workspace_id) {
            continue;
        }

        let personal = workspace
            .and_then(|workspace| value_bool(workspace, "personal"))
            .unwrap_or(false);
        let ws_name = workspace.and_then(|workspace| value_str(workspace, "name"));
        let ws_avatar = workspace.and_then(|workspace| value_str(workspace, "avatar_url"));
        let ws_logo = workspace.and_then(|workspace| value_str(workspace, "logo_url"));
        let creator_id = workspace.and_then(|workspace| value_str(workspace, "creator_id"));
        let tier = workspace
            .and_then(resolve_workspace_tier_value(&product_tiers_by_id))
            .flatten();

        let entry = guest_workspace_by_id
            .entry(workspace_id.clone())
            .or_insert_with(|| GuestWorkspace {
                summary: Value::Null,
                guest_board_ids: HashSet::new(),
                guest_highest_permission: None,
            });
        entry.guest_board_ids.insert(board_id);
        entry.guest_highest_permission =
            strongest_guest_permission(entry.guest_highest_permission.clone(), Some(permission));

        let name = if personal {
            display_label
                .clone()
                .or_else(|| ws_name.clone())
                .unwrap_or_else(|| "Personal".to_owned())
        } else {
            ws_name.clone().unwrap_or_else(|| "Untitled".to_owned())
        };
        let avatar_url = if personal {
            user_avatar_url.clone().or_else(|| ws_avatar.clone())
        } else {
            ws_avatar.clone()
        };
        let board_count = entry.guest_board_ids.len();
        let landing_path = if board_count == 1 {
            entry
                .guest_board_ids
                .iter()
                .next()
                .map(|board| format!("/tasks/boards/{board}"))
                .unwrap_or_else(|| "/tasks/boards".to_owned())
        } else {
            "/tasks/boards".to_owned()
        };

        entry.summary = json!({
            "id": workspace_id,
            "name": name,
            "personal": personal,
            "avatar_url": avatar_url,
            "logo_url": ws_logo,
            "created_by_me": creator_id.as_deref() == Some(user_id),
            "tier": tier,
            "access_type": "guest",
            "guest_products": ["tasks"],
            "guest_board_count": board_count,
            "guest_highest_permission": entry.guest_highest_permission,
            "guest_landing_path": landing_path,
        });
    }

    // Member workspace summaries (personal name/avatar override).
    let mut summaries: Vec<Value> = workspaces
        .iter()
        .map(|workspace| {
            let personal = workspace.personal.unwrap_or(false);
            let name = if personal {
                display_label
                    .clone()
                    .or_else(|| workspace.name.clone())
                    .unwrap_or_else(|| "Personal".to_owned())
            } else {
                workspace.name.clone().unwrap_or_default()
            };
            let avatar_url = if personal {
                user_avatar_url.clone().or_else(|| workspace.avatar_url.clone())
            } else {
                workspace.avatar_url.clone()
            };
            json!({
                "id": workspace.id,
                "name": name,
                "personal": personal,
                "avatar_url": avatar_url,
                "logo_url": workspace.logo_url,
                "created_by_me": workspace.creator_id.as_deref() == Some(user_id),
                "tier": resolve_workspace_tier(&workspace.workspace_subscriptions, &product_tiers_by_id),
                "access_type": "member",
            })
        })
        .collect();

    summaries.extend(
        guest_workspace_by_id
            .into_values()
            .filter(|guest| !guest.summary.is_null())
            .map(|guest| guest.summary),
    );

    Ok(summaries)
}

// --- Supabase REST reads ----------------------------------------------------

async fn member_workspaces(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<MemberWorkspaceRow>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,name,personal,avatar_url,logo_url,created_at,creator_id,workspace_members!inner(user_id),workspace_subscriptions!left(created_at,status,product_id)"
                    .to_owned(),
            ),
            ("workspace_members.user_id", format!("eq.{user_id}")),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        // Legacy `if (error) return []` semantics: an error yields an empty
        // workspace list rather than a 500.
        return Ok(Vec::new());
    }
    response.json::<Vec<MemberWorkspaceRow>>().map_err(|_| ())
}

async fn profile_details(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> (Option<UserProfileRow>, Option<UserPrivateDetailsRow>) {
    let public_profile = single_row::<UserProfileRow>(
        contact_data,
        outbound,
        "users",
        "display_name,handle,avatar_url",
        "id",
        user_id,
    )
    .await
    .ok()
    .flatten();

    let private_details = single_row::<UserPrivateDetailsRow>(
        contact_data,
        outbound,
        "user_private_details",
        "email",
        "user_id",
        user_id,
    )
    .await
    .ok()
    .flatten();

    (public_profile, private_details)
}

async fn single_row<T: for<'de> Deserialize<'de>>(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    table: &str,
    select: &str,
    column: &str,
    value: &str,
) -> Result<Option<T>, ()> {
    let Some(url) = contact_data.rest_url(
        table,
        &[
            ("select", select.to_owned()),
            (column, format!("eq.{value}")),
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
        .json::<Vec<T>>()
        .map_err(|_| ())?
        .into_iter()
        .next())
}

async fn guest_shares_by_user(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    guest_shares(
        contact_data,
        outbound,
        ("shared_with_user_id", format!("eq.{user_id}")),
    )
    .await
}

async fn guest_shares_by_email(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    email: &str,
) -> Result<Vec<GuestShareRow>, ()> {
    guest_shares(
        contact_data,
        outbound,
        ("shared_with_email", format!("eq.{email}")),
    )
    .await
}

async fn guest_shares(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    filter: (&str, String),
) -> Result<Vec<GuestShareRow>, ()> {
    let select = "board_id,permission,workspace_boards!inner(id,ws_id,deleted_at,workspaces!inner(id,name,personal,avatar_url,logo_url,creator_id,workspace_subscriptions!left(created_at,status,product_id)))";
    let Some(url) = contact_data.rest_url(
        "task_board_shares",
        &[
            ("select", select.to_owned()),
            (filter.0, filter.1),
            ("workspace_boards.deleted_at", "is.null".to_owned()),
        ],
    ) else {
        return Err(());
    };
    let response = send_service_role_get(contact_data, outbound, &url).await?;
    if !(200..300).contains(&response.status) {
        // Legacy swallows share-query errors and continues.
        return Ok(Vec::new());
    }
    Ok(response.json::<Vec<GuestShareRow>>().unwrap_or_default())
}

async fn fetch_subscription_product_tier_map(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    product_ids: &[String],
) -> HashMap<String, Option<String>> {
    let mut tier_by_product_id: HashMap<String, Option<String>> = HashMap::new();
    if product_ids.is_empty() {
        return tier_by_product_id;
    }

    let in_filter = format!("in.({})", product_ids.join(","));
    let Some(url) = contact_data.rest_url(
        "workspace_subscription_products",
        &[("select", "id,tier".to_owned()), ("id", in_filter)],
    ) else {
        return tier_by_product_id;
    };
    let Ok(response) = send_private_schema_get(contact_data, outbound, &url).await else {
        return tier_by_product_id;
    };
    if !(200..300).contains(&response.status) {
        return tier_by_product_id;
    }
    let Ok(rows) = response.json::<Vec<ProductTierRow>>() else {
        return tier_by_product_id;
    };
    for row in rows {
        tier_by_product_id.insert(row.id, normalize_workspace_tier(row.tier.as_deref()));
    }
    tier_by_product_id
}

async fn personal_workspace_id(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
) -> Result<Option<String>, ()> {
    let Some(url) = contact_data.rest_url(
        "workspaces",
        &[
            (
                "select",
                "id,workspace_members!inner(user_id,type)".to_owned(),
            ),
            ("personal", "eq.true".to_owned()),
            ("workspace_members.user_id", format!("eq.{user_id}")),
            ("workspace_members.type", format!("eq.{MEMBER_TYPE}")),
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
        .json::<Vec<WorkspaceIdRow>>()
        .map_err(|_| ())?
        .into_iter()
        .next()
        .and_then(|row| row.id))
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

async fn send_private_schema_get(
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
                .with_header("Accept-Profile", PRIVATE_SCHEMA)
                .with_header("Content-Profile", PRIVATE_SCHEMA)
                .with_header("Authorization", &authorization)
                .with_header("apikey", service_role_key),
        )
        .await
        .map_err(|_| ())
}

// --- Tier resolution --------------------------------------------------------

fn collect_subscription_product_ids(
    subscriptions: &[WorkspaceSubscriptionRow],
    product_ids: &mut HashSet<String>,
) {
    for subscription in subscriptions {
        if let Some(product_id) = &subscription.product_id {
            product_ids.insert(product_id.clone());
        }
    }
}

fn collect_subscription_product_ids_value(workspace: &Value, product_ids: &mut HashSet<String>) {
    let Some(subscriptions) = workspace
        .get("workspace_subscriptions")
        .and_then(Value::as_array)
    else {
        return;
    };
    for subscription in subscriptions {
        if let Some(product_id) = value_str(subscription, "product_id") {
            product_ids.insert(product_id);
        }
    }
}

fn resolve_workspace_tier(
    subscriptions: &[WorkspaceSubscriptionRow],
    product_tiers_by_id: &HashMap<String, Option<String>>,
) -> Option<String> {
    let mut active: Vec<&WorkspaceSubscriptionRow> = subscriptions
        .iter()
        .filter(|subscription| subscription.status.as_deref() == Some(ACTIVE_STATUS))
        .collect();
    active.sort_by(|a, b| {
        b.created_at
            .as_deref()
            .unwrap_or("")
            .cmp(a.created_at.as_deref().unwrap_or(""))
    });

    for subscription in active {
        if let Some(product_id) = &subscription.product_id {
            if let Some(Some(tier)) = product_tiers_by_id.get(product_id) {
                return Some(tier.clone());
            }
        }
    }
    None
}

// Variant operating on a serde_json workspace value (guest path). Returns a
// closure so it can be used with Option::and_then.
fn resolve_workspace_tier_value(
    product_tiers_by_id: &HashMap<String, Option<String>>,
) -> impl Fn(&Value) -> Option<Option<String>> + '_ {
    move |workspace: &Value| {
        let Some(subscriptions) = workspace
            .get("workspace_subscriptions")
            .and_then(Value::as_array)
        else {
            return Some(None);
        };
        let mut active: Vec<&Value> = subscriptions
            .iter()
            .filter(|subscription| {
                value_str(subscription, "status").as_deref() == Some(ACTIVE_STATUS)
            })
            .collect();
        active.sort_by(|a, b| {
            value_str(b, "created_at")
                .unwrap_or_default()
                .cmp(&value_str(a, "created_at").unwrap_or_default())
        });
        for subscription in active {
            if let Some(product_id) = value_str(subscription, "product_id") {
                if let Some(Some(tier)) = product_tiers_by_id.get(&product_id) {
                    return Some(Some(tier.clone()));
                }
            }
        }
        Some(None)
    }
}

fn normalize_workspace_tier(tier: Option<&str>) -> Option<String> {
    match tier {
        Some("FREE") | Some("PLUS") | Some("PRO") | Some("ENTERPRISE") => tier.map(str::to_owned),
        _ => None,
    }
}

// --- Guest share helpers ----------------------------------------------------

fn guest_share_workspace(share: &GuestShareRow) -> Option<&Value> {
    let board = first_object(share.workspace_boards.as_ref()?)?;
    first_object(board.get("workspaces")?)
}

fn first_object(value: &Value) -> Option<&Value> {
    match value {
        Value::Array(items) => items.first(),
        Value::Object(_) => Some(value),
        _ => None,
    }
}

fn value_str(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn value_bool(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(Value::as_bool)
}

fn strongest_guest_permission(
    existing: Option<String>,
    incoming: Option<String>,
) -> Option<String> {
    let has =
        |target: &str| existing.as_deref() == Some(target) || incoming.as_deref() == Some(target);
    if has("edit") {
        Some("edit".to_owned())
    } else if has("view") {
        Some("view".to_owned())
    } else {
        None
    }
}

fn normalize_share_email(email: Option<&str>) -> Option<String> {
    let normalized = email?.trim().to_lowercase();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|inner| !inner.is_empty())
}

// --- Responses --------------------------------------------------------------

fn success_response(
    personal_workspace_id: Option<String>,
    workspaces: Vec<Value>,
) -> BackendResponse {
    no_store_response(json_response(
        200,
        json!({
            "personalWorkspaceId": personal_workspace_id,
            "workspaces": workspaces,
        }),
    ))
}

fn message_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
