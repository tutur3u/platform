//! Port of `apps/web/src/app/api/v1/workspaces/route.ts`.
//!
//! `GET /api/v1/workspaces` returns the authenticated user's workspace
//! summaries (member workspaces + guest task-board workspaces), optionally
//! filtered/limited by the `q` and `limit` query parameters. This mirrors
//! `fetchWorkspaceSummaries` from `@tuturuuu/ui/lib/workspace-actions` and the
//! `searchIntent` fuzzy matcher from `@tuturuuu/utils/search`.
//!
//! Auth note: the legacy route runs the workspaces / task_board_shares reads
//! with the Supabase service-role (admin) client and the users /
//! user_private_details reads with the caller (RLS) client. Here we use the
//! service-role key for every read but constrain each query by the
//! authenticated user's id, so the result set is identical to the RLS-scoped
//! reads in the legacy implementation.

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    BackendConfig, BackendRequest, BackendResponse, contact, json_response, method_not_allowed,
    no_store_response, outbound::OutboundHttpClient, supabase_auth,
};

const WORKSPACES_PATH: &str = "/api/v1/workspaces";
const PRIVATE_SCHEMA: &str = "private";
const MAX_WORKSPACE_QUERY_LENGTH: usize = 120;
const MAX_WORKSPACE_SEARCH_LIMIT: i64 = 100;
const DEFAULT_WORKSPACE_SEARCH_LIMIT: usize = 50;
const UNAUTHORIZED_MESSAGE: &str = "Unauthorized";
const INTERNAL_SERVER_ERROR_MESSAGE: &str = "Internal server error";

// ---------------------------------------------------------------------------
// Supabase row types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SubscriptionProductInline {
    tier: Option<String>,
}

/// `workspace_subscription_products` can deserialize either as an object or an
/// array depending on the PostgREST embed cardinality.
#[derive(Deserialize)]
#[serde(untagged)]
enum SubscriptionProductInlineField {
    Object(SubscriptionProductInline),
    Array(Vec<SubscriptionProductInline>),
}

#[derive(Deserialize)]
struct WorkspaceSubscriptionRow {
    created_at: Option<String>,
    status: Option<String>,
    product_id: Option<String>,
    workspace_subscription_products: Option<SubscriptionProductInlineField>,
}

#[derive(Deserialize)]
struct WorkspaceRow {
    id: String,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    creator_id: Option<String>,
    #[serde(default)]
    workspace_subscriptions: Option<Vec<WorkspaceSubscriptionRow>>,
}

#[derive(Deserialize)]
struct PublicProfileRow {
    display_name: Option<String>,
    handle: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct PrivateDetailsRow {
    email: Option<String>,
}

#[derive(Deserialize)]
struct ProductTierRow {
    id: Option<String>,
    tier: Option<String>,
}

#[derive(Deserialize)]
struct GuestWorkspaceRow {
    id: Option<String>,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    creator_id: Option<String>,
    #[serde(default)]
    workspace_subscriptions: Option<Vec<WorkspaceSubscriptionRow>>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum GuestWorkspaceField {
    Object(Box<GuestWorkspaceRow>),
    Array(Vec<GuestWorkspaceRow>),
}

#[derive(Deserialize)]
struct GuestBoardRow {
    id: Option<String>,
    ws_id: Option<String>,
    workspaces: Option<GuestWorkspaceField>,
}

#[derive(Deserialize)]
struct GuestShareRow {
    board_id: Option<String>,
    permission: Option<String>,
    workspace_boards: Option<GuestBoardRow>,
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

/// Matches `InternalApiWorkspaceSummary`. Optional fields are only serialized
/// when present, mirroring the legacy object literals (member summaries omit
/// the guest_* fields entirely).
#[derive(Clone, Serialize)]
struct WorkspaceSummary {
    id: String,
    name: Option<String>,
    personal: Option<bool>,
    avatar_url: Option<String>,
    logo_url: Option<String>,
    created_by_me: bool,
    tier: Option<String>,
    access_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_products: Option<Vec<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_board_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_highest_permission: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    guest_landing_path: Option<String>,
}

// ---------------------------------------------------------------------------
// Submodules
// ---------------------------------------------------------------------------

mod fetch;
mod search;
mod summary;

use fetch::*;
use summary::*;

// ---------------------------------------------------------------------------
// Route entry point
// ---------------------------------------------------------------------------

pub(crate) async fn handle_workspaces_route(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> Option<BackendResponse> {
    if request.path != WORKSPACES_PATH {
        return None;
    }

    Some(match request.method {
        "GET" => workspaces_response(config, request, outbound).await,
        method => no_store_response(method_not_allowed(method, "GET")),
    })
}

async fn workspaces_response(
    config: &BackendConfig,
    request: BackendRequest<'_>,
    outbound: &impl OutboundHttpClient,
) -> BackendResponse {
    let Some(access_token) = supabase_auth::request_access_token(request) else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };
    let Some(user_id) =
        supabase_auth::fetch_supabase_auth_user(&config.contact_data, &access_token, outbound)
            .await
            .and_then(|user| user.id.filter(|id| !id.trim().is_empty()))
    else {
        return error_response(401, UNAUTHORIZED_MESSAGE);
    };

    let query = parse_workspace_search_params(request.url);

    match build_workspace_summaries(&config.contact_data, outbound, &user_id, &query).await {
        Ok(summaries) => no_store_response(json_response(200, summaries)),
        Err(()) => error_response(500, INTERNAL_SERVER_ERROR_MESSAGE),
    }
}

// ---------------------------------------------------------------------------
// Core fetch + assembly (mirrors fetchWorkspaceSummaries)
// ---------------------------------------------------------------------------

async fn build_workspace_summaries(
    contact_data: &contact::ContactDataConfig,
    outbound: &impl OutboundHttpClient,
    user_id: &str,
    query: &WorkspaceSearchParams,
) -> Result<Vec<Value>, ()> {
    // 1. Member workspaces (admin client + workspace_members!inner filter).
    // On query error the legacy code returns [] (not an error).
    let workspaces = match fetch_member_workspaces(contact_data, outbound, user_id).await {
        Ok(workspaces) => workspaces,
        Err(()) => return Ok(Vec::new()),
    };

    // 2. Resolve display label / avatar for personal workspaces.
    let public_profile = fetch_public_profile(contact_data, outbound, user_id)
        .await
        .unwrap_or(None);
    let private_details = fetch_private_details(contact_data, outbound, user_id)
        .await
        .unwrap_or(None);

    let display_label: Option<String> = public_profile
        .as_ref()
        .and_then(|profile| non_empty(profile.display_name.as_deref()))
        .or_else(|| {
            public_profile
                .as_ref()
                .and_then(|profile| non_empty(profile.handle.as_deref()))
        })
        .or_else(|| {
            private_details
                .as_ref()
                .and_then(|details| non_empty(details.email.as_deref()))
        });

    let user_avatar_url: Option<String> = public_profile
        .as_ref()
        .and_then(|profile| non_empty(profile.avatar_url.as_deref()));

    let member_workspace_ids: HashSet<String> = workspaces.iter().map(|ws| ws.id.clone()).collect();

    // 3. Guest task-board shares (by user id + by normalized email).
    let mut guest_share_rows: Vec<GuestShareRow> = Vec::new();
    if let Ok(rows) = fetch_guest_shares_by_user(contact_data, outbound, user_id).await {
        guest_share_rows.extend(rows);
    }
    let normalized_email = private_details
        .as_ref()
        .and_then(|details| normalize_task_board_share_email(details.email.as_deref()));
    if let Some(ref email) = normalized_email
        && let Ok(rows) = fetch_guest_shares_by_email(contact_data, outbound, email).await
    {
        guest_share_rows.extend(rows);
    }

    // 4. Collect subscription product ids across member + guest workspaces.
    let mut product_ids: HashSet<String> = HashSet::new();
    for ws in &workspaces {
        collect_subscription_product_ids(ws.workspace_subscriptions.as_deref(), &mut product_ids);
    }
    for share in &guest_share_rows {
        if let Some(ws) = guest_share_workspace(share) {
            collect_subscription_product_ids(
                ws.workspace_subscriptions.as_deref(),
                &mut product_ids,
            );
        }
    }
    let product_tiers = fetch_subscription_product_tier_map(contact_data, outbound, &product_ids)
        .await
        .unwrap_or_default();

    // 5. Build guest workspace summaries.
    let guest_summaries = build_guest_summaries(
        &guest_share_rows,
        &member_workspace_ids,
        &product_tiers,
        display_label.as_deref(),
        user_avatar_url.as_deref(),
        user_id,
    );

    // 6. Build member summaries (personal name/avatar override).
    let member_summaries: Vec<WorkspaceSummary> = workspaces
        .iter()
        .map(|ws| {
            let is_personal = ws.personal.unwrap_or(false);
            let name = if is_personal {
                display_label
                    .clone()
                    .or_else(|| ws.name.clone())
                    .or_else(|| Some("Personal".to_owned()))
            } else {
                ws.name.clone()
            };
            let avatar_url = if is_personal {
                user_avatar_url.clone().or_else(|| ws.avatar_url.clone())
            } else {
                ws.avatar_url.clone()
            };
            WorkspaceSummary {
                id: ws.id.clone(),
                name,
                personal: ws.personal,
                avatar_url,
                logo_url: ws.logo_url.clone(),
                created_by_me: ws.creator_id.as_deref() == Some(user_id),
                tier: resolve_workspace_tier(ws.workspace_subscriptions.as_deref(), &product_tiers),
                access_type: "member",
                guest_products: None,
                guest_board_count: None,
                guest_highest_permission: None,
                guest_landing_path: None,
            }
        })
        .collect();

    let mut summaries: Vec<WorkspaceSummary> = member_summaries;
    summaries.extend(guest_summaries);

    Ok(apply_workspace_summary_search(summaries, query))
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn is_success(status: u16) -> bool {
    (200..300).contains(&status)
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn error_response(status: u16, message: &str) -> BackendResponse {
    no_store_response(json_response(status, json!({ "error": message })))
}
